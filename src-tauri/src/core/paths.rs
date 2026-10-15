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
    ///
    /// Everything lives in one dot-prefixed folder (`.aether`, mirroring
    /// Modrinth's `.modrinth-app`) so it is easy to spot, back up or delete.
    /// An explicit `AETHER_DATA_DIR` always wins, and is never migrated into —
    /// if you point it somewhere, that is the whole data root.
    pub fn discover() -> Self {
        if let Ok(override_dir) = std::env::var("AETHER_DATA_DIR") {
            return Self::new(override_dir);
        }

        let data_dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
        migrate_legacy(&data_dir.join("Aether"), &data_dir.join(".aether"));
        Self::new(data_dir.join(".aether"))
    }
}

/// Move data written by earlier versions (`<data>/Aether`) into the dedicated
/// `<data>/.aether` folder, so an upgrade never drops accounts or instances.
///
/// Best effort on purpose: when anything is still in the way the old copy is
/// left where it was rather than destroyed, and the launcher starts from
/// whatever it can see.
fn migrate_legacy(legacy: &Path, root: &Path) {
    if !legacy.is_dir() {
        return;
    }

    // Usual case: the new root has not been touched yet, so the whole tree
    // moves in a single rename — same volume, so this is not a copy.
    if !root.exists() && std::fs::rename(legacy, root).is_ok() {
        return;
    }

    // The new root already exists, quite possibly with an empty `meta/`
    // skeleton from a previous run, so merge rather than skip what blocks us.
    merge_dir(legacy, root);
    // Only succeeds once every entry has been moved out.
    let _ = std::fs::remove_dir(legacy);
}

/// Move every entry of `from` into `to`, recursing where both sides already
/// have the same directory.
fn merge_dir(from: &Path, to: &Path) {
    let Ok(entries) = std::fs::read_dir(from) else {
        return;
    };
    if std::fs::create_dir_all(to).is_err() {
        return;
    }

    for entry in entries.flatten() {
        let src = entry.path();
        let dst = to.join(entry.file_name());

        if src.is_dir() {
            if dst.is_dir() {
                merge_dir(&src, &dst);
                let _ = std::fs::remove_dir(&src);
            } else if !dst.exists() {
                let _ = std::fs::rename(&src, &dst);
            }
        } else if !dst.exists() {
            // A rename can fail across volumes; fall back to copy + delete.
            if std::fs::rename(&src, &dst).is_err() && std::fs::copy(&src, &dst).is_ok() {
                let _ = std::fs::remove_file(&src);
            }
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    /// A clean scratch directory under the temp folder, keyed by test name so
    /// the tests can run in parallel.
    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("aether-paths-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }

    #[test]
    fn migrates_by_renaming_the_whole_tree() {
        let base = scratch("rename");
        let legacy = base.join("Aether");
        let root = base.join(".aether");

        std::fs::create_dir_all(legacy.join("meta/versions")).expect("legacy dirs");
        std::fs::write(legacy.join("accounts.json"), "[]").expect("accounts");
        std::fs::write(legacy.join("meta/versions/1.21.json"), "{}").expect("version");

        migrate_legacy(&legacy, &root);

        assert!(root.join("accounts.json").is_file(), "accounts must move");
        assert!(
            root.join("meta/versions/1.21.json").is_file(),
            "nested files must move"
        );
        assert!(!legacy.exists(), "legacy folder must be gone");

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn merges_into_a_root_that_already_exists() {
        let base = scratch("merge");
        let legacy = base.join("Aether");
        let root = base.join(".aether");

        // Simulate an earlier run that created an empty skeleton in the new
        // root while the real data was still sitting in the legacy folder.
        std::fs::create_dir_all(root.join("meta")).expect("root skeleton");
        std::fs::write(root.join("config.json"), "{}").expect("config");
        std::fs::create_dir_all(legacy.join("meta/versions")).expect("legacy dirs");
        std::fs::write(legacy.join("accounts.json"), "[]").expect("accounts");
        std::fs::write(legacy.join("meta/versions/1.21.json"), "{}").expect("version");

        migrate_legacy(&legacy, &root);

        assert!(root.join("config.json").is_file(), "existing files stay");
        assert!(root.join("accounts.json").is_file(), "legacy files arrive");
        assert!(
            root.join("meta/versions/1.21.json").is_file(),
            "existing dirs must be merged into, not skipped"
        );
        assert!(!legacy.exists(), "legacy folder must be emptied");

        let _ = std::fs::remove_dir_all(&base);
    }
}
