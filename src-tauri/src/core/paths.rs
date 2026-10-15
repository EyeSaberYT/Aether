//! Filesystem layout used by Aether.
//!
//! Everything the launcher owns lives under a single root directory so that a
//! user can back it up, move it, or delete it trivially.
//!
//! ```text
//! <root>/
//!   config.json          global launcher settings
//!   accounts.json        cached Microsoft/offline accounts & tokens
//!   instances.json       instance metadata index
//!   instances/<id>/
//!     instance.json      per-instance settings + resolved loaders
//!     .minecraft/        the actual game directory
//!   meta/                cached Mojang metadata (version manifest, etc.)
//!   java/                launcher-managed Java runtimes
//!   cache/               downloads, icons & asset cache
//! ```

use std::path::{Path, PathBuf};

use crate::error::Result;

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub root: PathBuf,
}

impl AppPaths {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// `<root>/config.json`
    pub fn config_file(&self) -> PathBuf {
        self.root.join("config.json")
    }

    /// `<root>/accounts.json`
    pub fn accounts_file(&self) -> PathBuf {
        self.root.join("accounts.json")
    }

    /// `<root>/instances.json`
    pub fn instances_index(&self) -> PathBuf {
        self.root.join("instances.json")
    }

    /// `<root>/instances`
    pub fn instances_dir(&self) -> PathBuf {
        self.root.join("instances")
    }

    /// `<root>/instances/<id>`
    pub fn instance_dir(&self, id: &str) -> PathBuf {
        self.instances_dir().join(id)
    }

    /// `<root>/instances/<id>/instance.json`
    pub fn instance_file(&self, id: &str) -> PathBuf {
        self.instance_dir(id).join("instance.json")
    }

    /// `<root>/instances/<id>/.minecraft`
    pub fn instance_game_dir(&self, id: &str) -> PathBuf {
        self.instance_dir(id).join(".minecraft")
    }

    /// `<root>/meta`
    pub fn meta_dir(&self) -> PathBuf {
        self.root.join("meta")
    }

    /// `<root>/meta/versions`
    pub fn versions_dir(&self) -> PathBuf {
        self.meta_dir().join("versions")
    }

    /// `<root>/meta/assets`
    pub fn assets_dir(&self) -> PathBuf {
        self.meta_dir().join("assets")
    }

    /// `<root>/meta/libraries`
    pub fn libraries_dir(&self) -> PathBuf {
        self.meta_dir().join("libraries")
    }

    /// `<root>/java`
    pub fn java_dir(&self) -> PathBuf {
        self.root.join("java")
    }

    /// `<root>/cache`
    pub fn cache_dir(&self) -> PathBuf {
        self.root.join("cache")
    }

    /// `<root>/cache/icons`
    pub fn icon_cache_dir(&self) -> PathBuf {
        self.cache_dir().join("icons")
    }

    /// Create every directory the launcher relies on.
    pub fn ensure(&self) -> Result<()> {
        for dir in [
            self.root.clone(),
            self.instances_dir(),
            self.meta_dir(),
            self.versions_dir(),
            self.assets_dir(),
            self.assets_dir().join("indexes"),
            self.assets_dir().join("objects"),
            self.libraries_dir(),
            self.java_dir(),
            self.cache_dir(),
            self.icon_cache_dir(),
        ] {
            std::fs::create_dir_all(&dir)?;
        }
        Ok(())
    }

    /// Resolve the correct place for the launcher data on the host OS.
    pub fn discover() -> Self {
        let root = if let Ok(override_dir) = std::env::var("AETHER_DATA_DIR") {
            PathBuf::from(override_dir)
        } else {
            dirs::data_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("Aether")
        };
        Self::new(root)
    }
}

/// Read JSON from a file, returning `None` when the file does not exist.
pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<Option<T>> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(path)?;
    if raw.trim().is_empty() {
        return Ok(None);
    }
    Ok(Some(serde_json::from_str(&raw)?))
}

/// Write JSON to a file atomically (write to a temp file then rename).
pub fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let pretty = serde_json::to_string_pretty(value)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, pretty)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}
