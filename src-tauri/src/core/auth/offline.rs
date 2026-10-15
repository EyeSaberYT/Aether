//! Offline ("cracked") account backend.
//!
//! No network calls at all: the account is derived purely from a username and
//! the same deterministic UUID algorithm the vanilla server uses in
//! `online-mode=false`. This is intentionally simple and clearly marked in the
//! UI so users understand online servers will reject them.

use super::{Account, AccountKind};
use crate::error::{AetherError, Result};

/// Build an offline account for `username`.
pub fn create(username: &str) -> Result<Account> {
    let username = username.trim();
    if username.len() < 3 || username.len() > 16 {
        return Err(AetherError::Auth(
            "Offline usernames must be between 3 and 16 characters.".into(),
        ));
    }
    if !username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(AetherError::Auth(
            "Offline usernames may only contain letters, numbers and underscores.".into(),
        ));
    }

    Ok(Account {
        kind: AccountKind::Offline,
        username: username.to_string(),
        uuid: super::offline_uuid(username),
        // Offline mode sends a deterministic dummy token; the vanilla server
        // ignores it entirely.
        access_token: "0".into(),
        expires_at: i64::MAX,
        refresh_token: None,
        skin_url: None,
    })
}
