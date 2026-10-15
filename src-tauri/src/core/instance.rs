//! Instance model, persistence and the on-disk instance store.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::paths::{read_json, write_json, AppPaths};
use crate::error::{AetherError, Result};

/// Supported mod loaders.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum LoaderKind {
    #[default]
    Vanilla,
    Fabric,
    Quilt,
    Forge,
    NeoForge,
}

impl LoaderKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            LoaderKind::Vanilla => "vanilla",
            LoaderKind::Fabric => "fabric",
            LoaderKind::Quilt => "quilt",
            LoaderKind::Forge => "forge",
            LoaderKind::NeoForge => "neoforge",
        }
    }

    /// The loader name Modrinth uses in its API facets.
    pub fn modrinth_name(&self) -> &'static str {
        match self {
            LoaderKind::Vanilla => "vanilla",
            LoaderKind::Fabric => "fabric",
            LoaderKind::Quilt => "quilt",
            LoaderKind::Forge => "forge",
            LoaderKind::NeoForge => "neoforge",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.to_ascii_lowercase().as_str() {
            "vanilla" | "release" => Some(LoaderKind::Vanilla),
            "fabric" => Some(LoaderKind::Fabric),
            "quilt" => Some(LoaderKind::Quilt),
            "forge" => Some(LoaderKind::Forge),
            "neoforge" => Some(LoaderKind::NeoForge),
            _ => None,
        }
    }
}

/// Where to send the player when the game starts (1.20+ "Quick Play").
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum QuickPlay {
    /// Join a specific multiplayer server.
    Multiplayer { address: String },
    /// Load a singleplayer world, optionally by folder name.
    Singleplayer { world: String },
    /// Continue the most recently played world.
    SingleplayerContinue,
    /// Open the vanilla title screen (default).
    None,
}

impl Default for QuickPlay {
    fn default() -> Self {
        QuickPlay::None
    }
}

/// Per-instance launch and behaviour settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceSettings {
    pub memory_min: u32,
    pub memory_max: u32,
    #[serde(default)]
    pub jvm_args: Vec<String>,
    #[serde(default)]
    pub game_args: Vec<String>,
    /// Explicit Java executable for this instance.
    pub java_path: Option<String>,
    /// Override the game directory (defaults to `<instance>/.minecraft`).
    pub game_dir: Option<String>,
    pub width: u32,
    pub height: u32,
    pub fullscreen: bool,
    #[serde(default)]
    pub quick_play: QuickPlay,
    /// Extra environment variables passed to the game process.
    #[serde(default)]
    pub env: Vec<(String, String)>,
}

impl Default for InstanceSettings {
    fn default() -> Self {
        Self {
            memory_min: 1024,
            memory_max: 4096,
            jvm_args: vec![],
            game_args: vec![],
            java_path: None,
            game_dir: None,
            width: 1280,
            height: 720,
            fullscreen: false,
            quick_play: QuickPlay::None,
            env: vec![],
        }
    }
}

/// A fully described launcher instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    /// Emoji, short text or a cached icon filename.
    pub icon: Option<String>,
    pub game_version: String,
    #[serde(default)]
    pub loader: LoaderKind,
    /// Pinned loader build; `None` means "latest compatible".
    pub loader_version: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub created: String,
    pub last_played: Option<String>,
    #[serde(default)]
    pub play_time_secs: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default)]
    pub settings: InstanceSettings,
    /// Modrinth project ids installed through the launcher. Used for updates.
    #[serde(default)]
    pub installed_projects: Vec<InstalledProject>,
}

/// A single piece of content installed via Modrinth, tracked for updates.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledProject {
    pub project_id: String,
    pub version_id: String,
    pub title: String,
    #[serde(default)]
    pub icon_url: Option<String>,
    /// `mod`, `resourcepack`, `shader`, `datapack`, `modpack`
    pub project_type: String,
    /// Filenames that belong to this version so we can remove old files.
    #[serde(default)]
    pub files: Vec<String>,
    #[serde(default)]
    pub installed_at: Option<String>,
}

impl Instance {
    /// Build a fresh instance with sensible defaults.
    pub fn new(name: impl Into<String>, game_version: impl Into<String>, loader: LoaderKind) -> Self {
        Self {
            id: new_id(),
            name: name.into(),
            icon: None,
            game_version: game_version.into(),
            loader,
            loader_version: None,
            group: None,
            tags: vec![],
            created: chrono::Utc::now().to_rfc3339(),
            last_played: None,
            play_time_secs: 0,
            notes: None,
            settings: InstanceSettings::default(),
            installed_projects: vec![],
        }
    }
}

/// Generate a human-friendly, filesystem-safe instance id.
pub fn new_id() -> String {
    let short = Uuid::new_v4().simple().to_string();
    short[..10].to_string()
}

/// Create a URL/filesystem slug from a display name.
pub fn slugify(name: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash && !out.is_empty() {
            out.push('-');
            last_dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "instance".to_string()
    } else {
        trimmed
    }
}

/// The index of every known instance, cached in memory.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct InstanceStore {
    #[serde(default)]
    pub instances: Vec<Instance>,
}

impl InstanceStore {
    pub fn load(paths: &AppPaths) -> Result<Self> {
        let mut store: InstanceStore = read_json(&paths.instances_index())?.unwrap_or_default();
        store.sort();
        Ok(store)
    }

    fn sort(&mut self) {
        self.instances.sort_by(|a, b| {
            b.last_played
                .clone()
                .unwrap_or_else(|| b.created.clone())
                .cmp(&a.last_played.clone().unwrap_or_else(|| a.created.clone()))
        });
    }

    pub fn save(&self, paths: &AppPaths) -> Result<()> {
        write_json(&paths.instances_index(), self)
    }

    pub fn get(&self, id: &str) -> Result<&Instance> {
        self.instances
            .iter()
            .find(|i| i.id == id)
            .ok_or_else(|| AetherError::NotFound(format!("instance `{id}`")))
    }

    pub fn get_mut(&mut self, id: &str) -> Result<&mut Instance> {
        self.instances
            .iter_mut()
            .find(|i| i.id == id)
            .ok_or_else(|| AetherError::NotFound(format!("instance `{id}`")))
    }

    /// Persist a single instance to `<instance>/instance.json` and to the index.
    pub fn persist(&self, paths: &AppPaths, id: &str) -> Result<()> {
        let instance = self.get(id)?;
        write_json(&paths.instance_file(id), instance)?;
        self.save(paths)
    }

    /// Verify that instance directories exist, recreating missing metadata.
    pub fn reconcile(&mut self, paths: &AppPaths) -> Result<()> {
        // Drop index entries whose directory disappeared.
        self.instances.retain(|i| paths.instance_dir(&i.id).exists());

        // Import directories that exist on disk but have no index entry.
        if let Ok(entries) = std::fs::read_dir(paths.instances_dir()) {
            for entry in entries.flatten() {
                if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    continue;
                }
                let id = entry.file_name().to_string_lossy().to_string();
                if self.instances.iter().any(|i| i.id == id) {
                    continue;
                }
                let meta = paths.instance_file(&id);
                if let Some(instance) = read_json::<Instance>(&meta)? {
                    self.instances.push(instance);
                }
            }
        }

        self.sort();
        self.save(paths)?;
        Ok(())
    }
}

/// The game directory for an instance, honouring a custom override.
pub fn game_dir(paths: &AppPaths, instance: &Instance) -> PathBuf {
    instance
        .settings
        .game_dir
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| paths.instance_game_dir(&instance.id))
}

/// Standard content sub-directory for a Modrinth project type.
pub fn content_dir(game_dir: &Path, project_type: &str) -> PathBuf {
    match project_type {
        "resourcepack" => game_dir.join("resourcepacks"),
        "shader" => game_dir.join("shaderpacks"),
        "datapack" => game_dir.join("datapacks"),
        "world" => game_dir.join("saves"),
        _ => game_dir.join("mods"),
    }
}
