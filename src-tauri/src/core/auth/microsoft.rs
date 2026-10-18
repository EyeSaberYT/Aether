//! Microsoft → Xbox Live → Minecraft authentication chain.
//!
//! We use the **OAuth 2.0 device code flow**, which is the friendliest option
//! for a desktop launcher: the user is shown a short code, opens
//! `microsoft.com/link` in any browser, and the launcher polls until the sign-in
//! completes. No embedded browser, no client secret, no loopback server.
//!
//! The chain is:
//!
//! ```text
//! Microsoft identity (device code)
//!   └─ Xbox Live user token (XBL)
//!        └─ XSTS token (relying party: rp://api.minecraftservices.com/)
//!             └─ Minecraft services token
//!                  └─ Minecraft profile (uuid + name)
//! ```

use serde::Deserialize;

use super::{Account, AccountKind};
use crate::error::{AetherError, Result};

/// Microsoft identity authority used for sign-in.
///
/// This must be `consumers`. The `XboxLive.signin` scope only exists for
/// personal Microsoft accounts; requesting it against a directory id or
/// `common` fails with AADSTS650053 ("scope ... doesn't exist on the resource
/// Microsoft Graph"). The app registration must therefore be configured to
/// allow personal Microsoft accounts (see the README), and users must sign in
/// with the personal account that owns Minecraft.
const TENANT: &str = "consumers";

fn device_code_url() -> String {
    format!("https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/devicecode")
}

fn token_url() -> String {
    format!("https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/token")
}
const XBL_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LOGIN_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
const MC_ENTITLEMENTS_URL: &str = "https://api.minecraftservices.com/entitlements/mcstore";

const SCOPE: &str = "XboxLive.signin offline_access";

// ---------------------------------------------------------------------------
// Legacy browser flow
// ---------------------------------------------------------------------------
//
// A brand new Entra app registration is rejected by
// `api.minecraftservices.com` ("Invalid app registration") until Mojang
// allow-lists it at <https://aka.ms/mce-reviewappid>. Aether's own id is
// allow-listed, but a fork's starts out unapproved, and there is always the flow
// the official launcher itself has used: Microsoft's own Minecraft client id.
//
// That id is *not* an Entra application, so the modern device-code endpoint
// rejects it outright (HTTP 400) and there is no device-code variant at all.
// The only way in is the legacy interactive flow, where the browser finishes on
// a Microsoft-owned page and the resulting URL has to be handed back to the
// launcher.

/// Microsoft's own Minecraft client id, used by the official launcher.
pub const LEGACY_CLIENT_ID: &str = "00000000402b5328";

const LEGACY_TOKEN_URL: &str = "https://login.live.com/oauth20_token.srf";
const LEGACY_REDIRECT_URI: &str = "https://login.live.com/oauth20_desktop.srf";
const LEGACY_SCOPE: &str = "service::user.auth.xboxlive.com::MBI_SSL";

/// The authorize URL for the legacy desktop flow.
///
/// Every part is fixed, so it is a constant rather than something we build and
/// percent-encode at runtime.
pub fn legacy_sign_in_url() -> &'static str {
    "https://login.live.com/oauth20_authorize.srf\
     ?client_id=00000000402b5328\
     &scope=service%3A%3Auser.auth.xboxlive.com%3A%3AMBI_SSL\
     &response_type=code\
     &redirect_uri=https%3A%2F%2Flogin.live.com%2Foauth20_desktop.srf"
}

/// Which token family an Xbox Live ticket comes from.
///
/// Xbox Live expects a one-letter prefix that tells it how to read the ticket,
/// and it differs between the two Microsoft endpoints.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TicketKind {
    /// Microsoft identity platform (Entra) token, scope `XboxLive.signin`.
    Modern,
    /// Legacy Live (MBI_SSL) token from `login.live.com`.
    Legacy,
}

impl TicketKind {
    fn prefix(self) -> &'static str {
        match self {
            TicketKind::Modern => "d=",
            TicketKind::Legacy => "t=",
        }
    }
}

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCodeInfo {
    pub user_code: String,
    pub verification_uri: String,
    pub message: String,
    pub expires_in: u64,
}

#[derive(Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    #[serde(default)]
    message: String,
    expires_in: u64,
    #[serde(default = "default_interval")]
    interval: u64,
}

fn default_interval() -> u64 {
    5
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default = "default_expires")]
    expires_in: i64,
}

fn default_expires() -> i64 {
    3600
}

#[derive(Deserialize)]
struct OAuthError {
    error: String,
    #[serde(default)]
    error_description: String,
    #[serde(default)]
    xerr: Option<u64>,
}

#[derive(Deserialize)]
struct XblResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: DisplayClaims,
}

#[derive(Deserialize)]
struct DisplayClaims {
    xui: Vec<Xui>,
}

#[derive(Deserialize)]
struct Xui {
    uhs: String,
}

#[derive(Deserialize)]
struct McTokenResponse {
    access_token: String,
    #[serde(default = "default_expires")]
    expires_in: i64,
}

#[derive(Deserialize)]
struct McProfile {
    id: String,
    name: String,
    #[serde(default)]
    skins: Vec<McSkin>,
}

#[derive(Deserialize)]
struct McSkin {
    state: String,
    url: String,
}

#[derive(Deserialize)]
struct McEntitlements {
    #[serde(default)]
    items: Vec<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Flow steps
// ---------------------------------------------------------------------------

/// Step 1: ask Microsoft for a device + user code.
pub async fn request_device_code(
    http: &reqwest::Client,
    client_id: &str,
) -> Result<(DeviceCodeInfo, String, u64)> {
    let res = http
        .post(device_code_url())
        .form(&[("client_id", client_id), ("scope", SCOPE)])
        .send()
        .await?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(AetherError::Auth(format!(
            "Microsoft rejected the device code request. Check that your client id is correct. ({body})"
        )));
    }

    let device: DeviceCodeResponse = res.json().await?;
    let info = DeviceCodeInfo {
        user_code: device.user_code.clone(),
        verification_uri: device.verification_uri.clone(),
        message: if device.message.is_empty() {
            "To sign in, open the link and enter the code below.".into()
        } else {
            device.message.clone()
        },
        expires_in: device.expires_in,
    };
    Ok((info, device.device_code, device.interval.max(1)))
}

/// Step 2: poll the token endpoint until the user finishes signing in.
pub async fn poll_for_token(
    http: &reqwest::Client,
    client_id: &str,
    device_code: &str,
    interval: u64,
    expires_in: u64,
) -> Result<(String, Option<String>, i64)> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(expires_in);
    let mut delay = interval;

    loop {
        if std::time::Instant::now() > deadline {
            return Err(AetherError::Auth(
                "The sign-in code expired before it was used. Please try again.".into(),
            ));
        }
        tokio::time::sleep(std::time::Duration::from_secs(delay)).await;

        let res = http
            .post(token_url())
            .form(&[
                ("client_id", client_id),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ("device_code", device_code),
            ])
            .send()
            .await?;

        if res.status().is_success() {
            let token: TokenResponse = res.json().await?;
            return Ok((token.access_token, token.refresh_token, token.expires_in));
        }

        // Polling errors are expected while the user is still authenticating.
        let err: OAuthError = res.json().await.unwrap_or(OAuthError {
            error: "unknown_error".into(),
            error_description: String::new(),
            xerr: None,
        });

        match err.error.as_str() {
            "authorization_pending" => continue,
            "slow_down" => {
                delay += 5;
                continue;
            }
            "expired_token" | "bad_verification_code" => {
                return Err(AetherError::Auth(
                    "The sign-in code expired. Please try again.".into(),
                ))
            }
            "authorization_declined" => {
                return Err(AetherError::Auth("Sign-in was declined.".into()))
            }
            other => {
                return Err(AetherError::Auth(format!(
                    "Microsoft sign-in failed ({other}): {}",
                    err.error_description
                )))
            }
        }
    }
}

/// Exchange a refresh token for a fresh Microsoft access token.
pub async fn refresh_token(
    http: &reqwest::Client,
    client_id: &str,
    refresh_token: &str,
) -> Result<(String, Option<String>, i64)> {
    let res = http
        .post(token_url())
        .form(&[
            ("client_id", client_id),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("scope", SCOPE),
        ])
        .send()
        .await?;

    if !res.status().is_success() {
        return Err(AetherError::Auth(
            "Your Microsoft session expired. Please sign in again.".into(),
        ));
    }

    let token: TokenResponse = res.json().await?;
    Ok((token.access_token, token.refresh_token, token.expires_in))
}

/// Step 3: trade the Microsoft access token for an XSTS token and a Minecraft
/// services token.
pub async fn xbox_chain(
    http: &reqwest::Client,
    ms_access_token: &str,
    ticket: TicketKind,
) -> Result<(String, i64)> {
    // 3a. Xbox Live user token.
    let xbl_res = http
        .post(XBL_URL)
        .json(&serde_json::json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("{}{}", ticket.prefix(), ms_access_token),
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT",
        }))
        .send()
        .await?;

    // Xbox Live returns a non-2xx body with a different shape on failure, so
    // check the status before decoding (otherwise it surfaces as a confusing
    // "error decoding response body" network error).
    if !xbl_res.status().is_success() {
        let status = xbl_res.status();
        let body = xbl_res.text().await.unwrap_or_default();
        return Err(AetherError::Auth(format!(
            "Xbox Live rejected the Microsoft sign-in (HTTP {status}). {body}"
        )));
    }
    let xbl: XblResponse = xbl_res.json().await?;

    let uhs = xbl
        .display_claims
        .xui
        .first()
        .map(|x| x.uhs.clone())
        .ok_or_else(|| AetherError::Auth("Xbox Live returned no user hash.".into()))?;

    // 3b. XSTS token.
    let xsts_res = http
        .post(XSTS_URL)
        .json(&serde_json::json!({
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbl.token],
            },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT",
        }))
        .send()
        .await?;

    if !xsts_res.status().is_success() {
        let err: OAuthError = xsts_res.json().await.unwrap_or(OAuthError {
            error: "xsts_error".into(),
            error_description: String::new(),
            xerr: None,
        });
        let message = match err.xerr {
            Some(2148916233) => {
                "This Microsoft account has no Xbox profile yet. Sign in at xbox.com once, then try again."
            }
            Some(2148916235) => "Xbox Live is not available in your region.",
            Some(2148916236) | Some(2148916237) => {
                "This account needs adult verification before it can play Minecraft."
            }
            Some(2148916238) => {
                "This is a child account. Ask a family organiser to add it to a Microsoft Family group."
            }
            _ => "Xbox Live rejected the sign-in. Please try again later.",
        };
        return Err(AetherError::Auth(message.into()));
    }

    let xsts: XblResponse = xsts_res.json().await?;

    // 3c. Minecraft services token.
    let mc_res = http
        .post(MC_LOGIN_URL)
        .json(&serde_json::json!({
            "identityToken": format!("XBL3.0 x={uhs};{}", xsts.token),
        }))
        .send()
        .await?;

    // Minecraft services returns a non-2xx body with a different shape on
    // failure, so check the status before decoding. This is also where a brand
    // new Azure app registration is rejected until Mojang allow-lists it.
    if !mc_res.status().is_success() {
        let status = mc_res.status();
        let body = mc_res.text().await.unwrap_or_default();

        if body.contains("Invalid app registration") {
            return Err(AetherError::Auth(
                "This build's Azure app registration hasn't been allow-listed by Mojang, so \
                 the final Minecraft login step is blocked (HTTP 403, \"Invalid app \
                 registration\"). The client id needs approval at \
                 https://aka.ms/mce-reviewappid. Until then, sign in with the browser \
                 sign-in option in the sign-in dialog."
                    .into(),
            ));
        }
        return Err(AetherError::Auth(format!(
            "Minecraft services rejected the login (HTTP {status}). {body}"
        )));
    }
    let mc: McTokenResponse = mc_res.json().await?;

    Ok((mc.access_token, mc.expires_in))
}

/// Step 4: fetch the player's Minecraft profile (uuid + username).
pub async fn fetch_profile(
    http: &reqwest::Client,
    mc_access_token: &str,
) -> Result<(String, String, Option<String>)> {
    let res = http
        .get(MC_PROFILE_URL)
        .bearer_auth(mc_access_token)
        .send()
        .await?;

    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(AetherError::Auth(
            "This Microsoft account doesn't own Minecraft: Java Edition.".into(),
        ));
    }
    if !res.status().is_success() {
        return Err(AetherError::Auth(
            "Minecraft services rejected the login. Please try again.".into(),
        ));
    }

    let profile: McProfile = res.json().await?;
    let skin_url = profile
        .skins
        .iter()
        .find(|s| s.state == "ACTIVE")
        .map(|s| s.url.as_str())
        .or_else(|| profile.skins.first().map(|s| s.url.as_str()))
        .map(normalize_texture_url);
    Ok((dashify_uuid(&profile.id), profile.name, skin_url))
}

/// Mojang hands back `http://textures.minecraft.net/…`, but the app's CSP only
/// allows `https://` for that host, so normalise before the url is stored or
/// handed to the webview.
fn normalize_texture_url(url: &str) -> String {
    match url.strip_prefix("http://textures.minecraft.net") {
        Some(rest) => format!("https://textures.minecraft.net{rest}"),
        None => url.to_string(),
    }
}

/// Look up a stored account's skin, back-filling it when missing.
///
/// Accounts saved by builds that didn't record a texture url (or signed in
/// while the profile still reported none) keep showing a placeholder until this
/// runs, so the accounts command fills the gap on read. Deliberately best
/// effort: a missing skin never breaks sign-in, and it is refreshed again on
/// the next token refresh.
pub async fn skin_for_account(
    http: &reqwest::Client,
    account: &Account,
) -> Result<Option<String>> {
    if let Some(skin) = account.skin_url.as_ref() {
        return Ok(Some(skin.clone()));
    }
    // Offline profiles have no Mojang profile, and an expired token would only
    // produce a 401 — the next refresh covers both cases.
    if account.kind == AccountKind::Offline || account.is_expired() {
        return Ok(None);
    }

    let (_, _, skin) = fetch_profile(http, &account.access_token).await?;
    Ok(skin)
}

/// Confirm the account actually owns the game.
pub async fn check_entitlements(http: &reqwest::Client, mc_access_token: &str) -> Result<()> {
    let res = http
        .get(MC_ENTITLEMENTS_URL)
        .bearer_auth(mc_access_token)
        .send()
        .await?;

    if !res.status().is_success() {
        // Not fatal: some accounts legitimately return 204/404 here.
        return Ok(());
    }

    if let Ok(entitlements) = res.json::<McEntitlements>().await {
        if entitlements.items.is_empty() {
            return Err(AetherError::Auth(
                "This Microsoft account doesn't own Minecraft: Java Edition.".into(),
            ));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// High level helpers
// ---------------------------------------------------------------------------

/// Complete device-code sign-in, returning a ready-to-use [`Account`].
///
/// `on_code` is invoked once the user code is available so the UI can display
/// it while we poll.
pub async fn login<F>(
    http: &reqwest::Client,
    client_id: &str,
    on_code: F,
) -> Result<Account>
where
    F: FnOnce(&DeviceCodeInfo),
{
    let (info, device_code, interval) = request_device_code(http, client_id).await?;
    on_code(&info);

    let (ms_token, refresh, _) =
        poll_for_token(http, client_id, &device_code, interval, info.expires_in).await?;

    let (mc_token, expires_in) = xbox_chain(http, &ms_token, TicketKind::Modern).await?;
    check_entitlements(http, &mc_token).await.ok();
    let (uuid, name, skin_url) = fetch_profile(http, &mc_token).await?;

    Ok(Account {
        kind: AccountKind::Microsoft,
        username: name,
        uuid,
        access_token: mc_token,
        expires_at: chrono::Utc::now().timestamp() + expires_in,
        refresh_token: refresh,
        skin_url,
        legacy_auth: false,
    })
}

/// Re-authenticate a stored Microsoft account using its refresh token.
pub async fn refresh_account(
    http: &reqwest::Client,
    client_id: &str,
    account: &Account,
) -> Result<Account> {
    let refresh = account
        .refresh_token
        .clone()
        .ok_or_else(|| AetherError::Auth("No refresh token stored for this account.".into()))?;

    let (ms_token, new_refresh, _) = refresh_token(http, client_id, &refresh).await?;
    let (mc_token, expires_in) = xbox_chain(http, &ms_token, TicketKind::Modern).await?;
    let (uuid, name, skin_url) = fetch_profile(http, &mc_token).await?;

    Ok(Account {
        kind: AccountKind::Microsoft,
        username: name,
        uuid,
        access_token: mc_token,
        expires_at: chrono::Utc::now().timestamp() + expires_in,
        refresh_token: new_refresh.or(account.refresh_token.clone()),
        skin_url: skin_url.or_else(|| account.skin_url.clone()),
        legacy_auth: false,
    })
}

/// Finish the legacy browser sign-in from the URL the user copied back.
pub async fn complete_legacy_login(
    http: &reqwest::Client,
    pasted_redirect: &str,
) -> Result<Account> {
    let code = legacy_code_from_redirect(pasted_redirect)?;

    let res = http
        .post(LEGACY_TOKEN_URL)
        .form(&[
            ("client_id", LEGACY_CLIENT_ID),
            ("code", code.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", LEGACY_REDIRECT_URI),
            ("scope", LEGACY_SCOPE),
        ])
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(AetherError::Auth(format!(
            "Microsoft rejected that sign-in code (HTTP {status}). Codes are single-use \
             and expire after about ten minutes, so open the sign-in page again and copy \
             the fresh URL. {body}"
        )));
    }

    let token: TokenResponse = res.json().await?;
    let (mc_token, expires_in) =
        xbox_chain(http, &token.access_token, TicketKind::Legacy).await?;
    check_entitlements(http, &mc_token).await.ok();
    let (uuid, name, skin_url) = fetch_profile(http, &mc_token).await?;

    Ok(Account {
        kind: AccountKind::Microsoft,
        username: name,
        uuid,
        access_token: mc_token,
        expires_at: chrono::Utc::now().timestamp() + expires_in,
        refresh_token: token.refresh_token,
        skin_url,
        legacy_auth: true,
    })
}

/// Re-authenticate an account created by [`complete_legacy_login`].
///
/// Its refresh token belongs to `login.live.com`, so it has to go back there
/// with the legacy client id — the Microsoft identity endpoint would refuse it.
pub async fn refresh_legacy_account(
    http: &reqwest::Client,
    account: &Account,
) -> Result<Account> {
    let refresh = account
        .refresh_token
        .clone()
        .ok_or_else(|| AetherError::Auth("No refresh token stored for this account.".into()))?;

    let res = http
        .post(LEGACY_TOKEN_URL)
        .form(&[
            ("client_id", LEGACY_CLIENT_ID),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh.as_str()),
            ("scope", LEGACY_SCOPE),
        ])
        .send()
        .await?;

    if !res.status().is_success() {
        return Err(AetherError::Auth(
            "Your Microsoft session expired. Please sign in again.".into(),
        ));
    }

    let token: TokenResponse = res.json().await?;
    let (mc_token, expires_in) =
        xbox_chain(http, &token.access_token, TicketKind::Legacy).await?;
    let (uuid, name, skin_url) = fetch_profile(http, &mc_token).await?;

    Ok(Account {
        kind: AccountKind::Microsoft,
        username: name,
        uuid,
        access_token: mc_token,
        expires_at: chrono::Utc::now().timestamp() + expires_in,
        refresh_token: token.refresh_token.or(account.refresh_token.clone()),
        // Keep the previous texture if this refresh didn't return one.
        skin_url: skin_url.or_else(|| account.skin_url.clone()),
        legacy_auth: true,
    })
}

/// Pull the authorization code out of whatever the user pasted back.
///
/// The legacy redirect finishes on a page Microsoft owns, so the address bar is
/// the only place the code exists. Accept a whole URL, a bare query string, or
/// just the code itself, and report the friendly reason when Microsoft sent an
/// error back instead.
pub fn legacy_code_from_redirect(pasted: &str) -> Result<String> {
    let text = pasted.trim();
    if text.is_empty() {
        return Err(AetherError::Auth(
            "Paste the URL from the sign-in page's address bar first.".into(),
        ));
    }

    if let Some(error) = query_value(text, "error") {
        let description = query_value(text, "error_description").unwrap_or_default();
        return Err(AetherError::Auth(format!(
            "Microsoft declined the sign-in ({error}). {description}"
        )));
    }

    if let Some(code) = query_value(text, "code") {
        return Ok(code);
    }

    // A bare code has no URL punctuation in it.
    if !text.contains('/') && !text.contains(' ') && !text.contains('?') {
        return Ok(text.to_string());
    }

    Err(AetherError::Auth(
        "That doesn't look like the sign-in page's address. Copy the entire URL from \
         the address bar — it contains \"code=\"."
            .into(),
    ))
}

/// Read `key=value` out of a query string, ignoring lookalike keys.
///
/// The leading `?`/`&` matters: without it `device_code=` would answer a lookup
/// for `code`.
fn query_value(text: &str, key: &str) -> Option<String> {
    let bare = format!("{key}=");
    let candidates = [
        if text.starts_with(&bare) { Some(0) } else { None },
        text.find(&format!("?{bare}")).map(|at| at + 1),
        text.find(&format!("&{bare}")).map(|at| at + 1),
    ];

    for start in candidates.into_iter().flatten() {
        let rest = &text[start + bare.len()..];
        let end = rest.find(['&', '#']).unwrap_or(rest.len());
        let value = rest[..end].trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

/// Insert dashes into a 32-char dashless UUID.
pub fn dashify_uuid(raw: &str) -> String {
    if raw.len() != 32 {
        return raw.to_string();
    }
    format!(
        "{}-{}-{}-{}-{}",
        &raw[0..8],
        &raw[8..12],
        &raw[12..16],
        &raw[16..20],
        &raw[20..32]
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_code_from_a_pasted_url() {
        let pasted = "https://login.live.com/oauth20_desktop.srf?code=M.C531_BAY.2.U.abc-123_XYZ&lc=1033";
        assert_eq!(
            legacy_code_from_redirect(pasted).unwrap(),
            "M.C531_BAY.2.U.abc-123_XYZ"
        );
    }

    #[test]
    fn reads_a_code_from_a_bare_query_string() {
        assert_eq!(legacy_code_from_redirect("code=abc.123").unwrap(), "abc.123");
    }

    #[test]
    fn accepts_a_bare_code() {
        assert_eq!(legacy_code_from_redirect("  abc.123  ").unwrap(), "abc.123");
    }

    #[test]
    fn stops_at_a_fragment() {
        let pasted = "https://login.live.com/oauth20_desktop.srf?code=abc#frag";
        assert_eq!(legacy_code_from_redirect(pasted).unwrap(), "abc");
    }

    #[test]
    fn does_not_mistake_device_code_for_code() {
        // `device_code` must not answer a lookup for `code`.
        let pasted = "https://example.test/cb?device_code=zzz&code=real";
        assert_eq!(legacy_code_from_redirect(pasted).unwrap(), "real");
    }

    #[test]
    fn surfaces_microsoft_errors() {
        let pasted =
            "https://login.live.com/oauth20_desktop.srf?error=access_denied&error_description=Bye";
        let error = legacy_code_from_redirect(pasted).unwrap_err().to_string();
        assert!(error.contains("access_denied"), "got: {error}");
    }

    #[test]
    fn rejects_a_url_without_a_code() {
        assert!(legacy_code_from_redirect("https://login.live.com/oauth20_desktop.srf").is_err());
        assert!(legacy_code_from_redirect("").is_err());
    }

    #[test]
    fn tenant_and_prefixes_are_unchanged() {
        assert_eq!(TENANT, "consumers");
        assert_eq!(TicketKind::Modern.prefix(), "d=");
        assert_eq!(TicketKind::Legacy.prefix(), "t=");
        assert!(legacy_sign_in_url().contains("client_id=00000000402b5328"));
    }

    #[test]
    fn texture_urls_are_upgraded_to_https() {
        // The webview's CSP only allows https for this host.
        assert_eq!(
            normalize_texture_url("http://textures.minecraft.net/texture/abc"),
            "https://textures.minecraft.net/texture/abc"
        );
        assert_eq!(
            normalize_texture_url("https://textures.minecraft.net/texture/abc"),
            "https://textures.minecraft.net/texture/abc"
        );
        // Anything else is left exactly as received.
        assert_eq!(
            normalize_texture_url("http://example.test/x"),
            "http://example.test/x"
        );
    }
}
