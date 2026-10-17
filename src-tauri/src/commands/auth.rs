//! Authentication commands.

use tauri::{AppHandle, Emitter, State};

use crate::core::auth::microsoft::{self, DeviceCodeInfo};
use crate::core::auth::{offline, Account, AccountKind, AccountStore};
use crate::core::config;
use crate::error::{AetherError, Result};
use crate::state::AppState;

/// Accounts exposed to the UI. Tokens are stripped.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAccount {
    pub uuid: String,
    pub username: String,
    pub kind: AccountKind,
    pub skin_url: Option<String>,
    pub active: bool,
}

fn public(store: &AccountStore) -> Vec<PublicAccount> {
    store
        .accounts
        .iter()
        .map(|a| PublicAccount {
            uuid: a.uuid.clone(),
            username: a.username.clone(),
            kind: a.kind,
            skin_url: a.skin_url.clone(),
            active: store.active.as_deref() == Some(a.uuid.as_str()),
        })
        .collect()
}

/// Back-fill skin urls that older builds (or an earlier sign-in) never saved.
///
/// Best effort and time-boxed: a slow or offline network must never stall the
/// account list, and a failed lookup simply keeps the placeholder until the next
/// token refresh supplies the texture.
async fn fill_missing_skins(state: &AppState) {
    let pending: Vec<Account> = {
        let store = state.accounts.read().await;
        store
            .accounts
            .iter()
            .filter(|account| account.skin_url.is_none())
            .cloned()
            .collect()
    };
    if pending.is_empty() {
        return;
    }

    for account in pending {
        let skin = tokio::time::timeout(
            std::time::Duration::from_secs(4),
            microsoft::skin_for_account(&state.http, &account),
        )
        .await
        .ok()
        .and_then(|outcome| outcome.ok())
        .flatten();

        let Some(skin) = skin else { continue };

        let mut store = state.accounts.write().await;
        if let Some(existing) = store.accounts.iter_mut().find(|a| a.uuid == account.uuid) {
            existing.skin_url = Some(skin);
            // A failed write only costs one extra lookup next launch, so it
            // must not fail the account list over a cosmetic field.
            let _ = store.save(&state.paths);
        }
    }
}

#[tauri::command]
pub async fn auth_accounts(state: State<'_, AppState>) -> Result<Vec<PublicAccount>> {
    fill_missing_skins(state.inner()).await;
    let store = state.accounts.read().await;
    Ok(public(&store))
}

/// Start the Microsoft device-code sign-in.
///
/// The user code is emitted as an `auth://device-code` event so the UI can show
/// it while we poll in the background.
#[tauri::command]
pub async fn auth_login_microsoft(app: AppHandle, state: State<'_, AppState>) -> Result<PublicAccount> {
    let client_id = config::microsoft_client_id();
    if client_id.trim().is_empty() {
        return Err(AetherError::Auth(
            "This build has no Microsoft client id compiled in, so online sign-in is \
             unavailable. Use an offline account instead."
                .into(),
        ));
    }

    let http = state.http.clone();
    let emitter = app.clone();

    let account = microsoft::login(&http, &client_id, move |info: &DeviceCodeInfo| {
        let _ = emitter.emit("auth://device-code", info.clone());
    })
    .await?;

    let mut store = state.accounts.write().await;
    store.active = Some(account.uuid.clone());
    store.upsert(account.clone());
    store.save(&state.paths)?;

    Ok(PublicAccount {
        uuid: account.uuid,
        username: account.username,
        kind: account.kind,
        skin_url: account.skin_url,
        active: true,
    })
}

/// The URL to open for the legacy browser sign-in.
///
/// Used when our own app registration hasn't been allow-listed by Mojang yet:
/// this path borrows Microsoft's own Minecraft client id, which already is.
#[tauri::command]
pub fn auth_legacy_url() -> String {
    microsoft::legacy_sign_in_url().to_string()
}

/// Complete the legacy sign-in from the URL the user copied out of the browser.
#[tauri::command]
pub async fn auth_login_microsoft_legacy(
    state: State<'_, AppState>,
    redirect: String,
) -> Result<PublicAccount> {
    let account = microsoft::complete_legacy_login(&state.http, &redirect).await?;

    let mut store = state.accounts.write().await;
    store.active = Some(account.uuid.clone());
    store.upsert(account.clone());
    store.save(&state.paths)?;

    Ok(PublicAccount {
        uuid: account.uuid,
        username: account.username,
        kind: account.kind,
        skin_url: account.skin_url,
        active: true,
    })
}

/// Create a local, offline account.
#[tauri::command]
pub async fn auth_login_offline(
    state: State<'_, AppState>,
    username: String,
    set_active: Option<bool>,
) -> Result<PublicAccount> {
    let account = offline::create(&username)?;

    let mut store = state.accounts.write().await;
    if set_active.unwrap_or(true) {
        store.active = Some(account.uuid.clone());
    }
    store.upsert(account.clone());
    store.save(&state.paths)?;

    Ok(PublicAccount {
        uuid: account.uuid,
        username: account.username,
        kind: account.kind,
        skin_url: account.skin_url,
        active: set_active.unwrap_or(true),
    })
}

#[tauri::command]
pub async fn auth_set_active(state: State<'_, AppState>, uuid: String) -> Result<Vec<PublicAccount>> {
    let mut store = state.accounts.write().await;
    if !store.accounts.iter().any(|a| a.uuid == uuid) {
        return Err(AetherError::NotFound("that account".into()));
    }
    store.active = Some(uuid);
    store.save(&state.paths)?;
    Ok(public(&store))
}

#[tauri::command]
pub async fn auth_logout(state: State<'_, AppState>, uuid: String) -> Result<Vec<PublicAccount>> {
    let mut store = state.accounts.write().await;
    store.accounts.retain(|a| a.uuid != uuid);
    if store.active.as_deref() == Some(uuid.as_str()) {
        store.active = store.accounts.first().map(|a| a.uuid.clone());
    }
    store.save(&state.paths)?;
    Ok(public(&store))
}

/// Return the active account, refreshing its token when needed.
pub async fn active_account(state: &AppState) -> Result<Account> {
    let mut account = {
        let store = state.accounts.read().await;
        store.active_account().cloned()
    };

    let account = account
        .take()
        .ok_or_else(|| AetherError::Auth("No account selected. Sign in first.".into()))?;

    if !account.is_expired() {
        return Ok(account);
    }

    if account.kind == AccountKind::Offline {
        return Ok(account);
    }

    // Refresh and persist the new token. Accounts from the legacy browser flow
    // live on a different Microsoft endpoint and must go back through it.
    let refreshed = if account.legacy_auth {
        microsoft::refresh_legacy_account(&state.http, &account).await?
    } else {
        microsoft::refresh_account(&state.http, config::microsoft_client_id(), &account).await?
    };
    {
        let mut store = state.accounts.write().await;
        store.upsert(refreshed.clone());
        store.save(&state.paths)?;
    }
    Ok(refreshed)
}

#[tauri::command]
pub async fn auth_current(state: State<'_, AppState>) -> Result<Option<PublicAccount>> {
    let store = state.accounts.read().await;
    Ok(store.active_account().map(|a| PublicAccount {
        uuid: a.uuid.clone(),
        username: a.username.clone(),
        kind: a.kind,
        skin_url: a.skin_url.clone(),
        active: true,
    }))
}
