//! Minecraft account authentication.
//!
//! Two backends are supported:
//! * [`microsoft`] – the real, online Microsoft/Xbox Live chain (device code flow).
//! * [`offline`] – a synthetic account with a deterministic UUID for cracked
//!   servers. It is clearly flagged as offline everywhere in the UI.

pub mod microsoft;
pub mod offline;

use serde::{Deserialize, Serialize};

use super::paths::{read_json, write_json, AppPaths};
use crate::error::Result;

/// How an account authenticates.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AccountKind {
    Microsoft,
    Offline,
}

/// A signed-in Minecraft account.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub kind: AccountKind,
    pub username: String,
    /// Dashless Minecraft UUID.
    pub uuid: String,
    pub access_token: String,
    /// Unix timestamp (seconds) at which `access_token` expires.
    pub expires_at: i64,
    pub refresh_token: Option<String>,
    /// Player skin texture url, when available.
    #[serde(default)]
    pub skin_url: Option<String>,
}

impl Account {
    pub fn is_expired(&self) -> bool {
        self.kind == AccountKind::Microsoft && chrono::Utc::now().timestamp() >= self.expires_at - 60
    }

    /// The `user_type` value passed to the game.
    pub fn user_type(&self) -> &'static str {
        match self.kind {
            AccountKind::Microsoft => "msa",
            AccountKind::Offline => "legacy",
        }
    }
}

/// Persistent list of accounts plus the currently selected one.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountStore {
    #[serde(default)]
    pub accounts: Vec<Account>,
    #[serde(default)]
    pub active: Option<String>,
}

impl AccountStore {
    pub fn load(paths: &AppPaths) -> Result<Self> {
        Ok(read_json(&paths.accounts_file())?.unwrap_or_default())
    }

    pub fn save(&self, paths: &AppPaths) -> Result<()> {
        write_json(&paths.accounts_file(), self)
    }

    pub fn active_account(&self) -> Option<&Account> {
        let active = self.active.as_ref()?;
        self.accounts.iter().find(|a| a.uuid == *active)
    }

    pub fn upsert(&mut self, account: Account) {
        if let Some(existing) = self.accounts.iter_mut().find(|a| a.uuid == account.uuid) {
            *existing = account;
        } else {
            self.accounts.push(account);
        }
    }
}

/// Deterministic, offline-compatible UUID: Java's `UUID.nameUUIDFromBytes`
/// applied to `OfflinePlayer:<name>` (MD5, version 3, RFC 4122 variant).
pub fn offline_uuid(username: &str) -> String {
    use md5::{Digest, Md5};

    let mut hasher = Md5::new();
    hasher.update(format!("OfflinePlayer:{username}").as_bytes());
    let mut bytes: [u8; 16] = hasher.finalize().into();
    bytes[6] = (bytes[6] & 0x0f) | 0x30; // version 3
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // IETF variant

    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}
