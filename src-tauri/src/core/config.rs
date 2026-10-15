//! Global (non per-instance) launcher settings.

use serde::{Deserialize, Serialize};

use super::paths::{read_json, write_json, AppPaths};
use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Explicit Java executable for all instances (overrides auto-detection).
    pub java_path: Option<String>,
    /// Default memory allocation used when creating a new instance (MiB).
    pub default_memory_min: u32,
    pub default_memory_max: u32,
    /// Default JVM arguments prepended to every launch.
    #[serde(default)]
    pub default_jvm_args: Vec<String>,
    /// How many files to download in parallel.
    pub concurrent_downloads: usize,
    /// Enable Discord-style background update checks on startup.
    pub check_updates_on_start: bool,
    /// Show snapshots / betas in the version picker.
    pub show_snapshots: bool,
    /// Close the launcher window when the game starts.
    pub close_on_launch: bool,
    /// Keep the launcher running and show a "running" state instead.
    pub keep_launcher_open: bool,
    /// UI accent theme.
    pub theme: Theme,
    /// Modrinth API base URL (overridable for self-hosted Labrinth).
    pub modrinth_api_url: String,
    /// Microsoft OAuth client id used for the device-code flow.
    pub microsoft_client_id: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            java_path: None,
            default_memory_min: 1024,
            default_memory_max: 4096,
            default_jvm_args: vec![
                "-XX:+UseG1GC".into(),
                "-XX:-UseAdaptiveSizePolicy".into(),
                "-XX:G1NewSizePercent=20".into(),
                "-Dfile.encoding=UTF-8".into(),
            ],
            concurrent_downloads: 8,
            check_updates_on_start: true,
            show_snapshots: false,
            close_on_launch: false,
            keep_launcher_open: true,
            theme: Theme::Dark,
            modrinth_api_url: "https://api.modrinth.com/v2".into(),
            microsoft_client_id: default_client_id(),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Dark,
    Light,
    System,
}

/// Default Microsoft OAuth client id.
///
/// This is an Azure "public client" application id. Users who want their own
/// can override it in Settings or via the `AETHER_MS_CLIENT_ID` env var. See the
/// README for how to register one (it takes ~2 minutes and is free).
pub fn default_client_id() -> String {
    std::env::var("AETHER_MS_CLIENT_ID").unwrap_or_else(|_| {
        // Placeholder: replace with your own Azure app registration id.
        "00000000-0000-0000-0000-000000000000".to_string()
    })
}

impl Settings {
    pub fn load(paths: &AppPaths) -> Result<Self> {
        Ok(read_json(&paths.config_file())?.unwrap_or_default())
    }

    pub fn save(&self, paths: &AppPaths) -> Result<()> {
        write_json(&paths.config_file(), self)
    }
}
