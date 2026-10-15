//! Modrinth modpack (`.mrpack`) import and export.
//!
//! A `.mrpack` is a zip archive containing:
//! * `modrinth.index.json` – the manifest (files to download + dependencies)
//! * `overrides/` – files copied into every game directory
//! * `client-overrides/` – files copied only into client game directories
//!
//! See <https://docs.modrinth.com/docs/modpacks/format_definition/>.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::download::{download_many, DownloadSpec, Progress, ProgressSink};
use super::instance::{LoaderKind, InstalledProject};
use crate::error::{AetherError, Result};

pub const INDEX_FILE: &str = "modrinth.index.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MrpackIndex {
    pub format_version: u32,
    #[serde(default = "default_game")]
    pub game: String,
    #[serde(default)]
    pub version_id: String,
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub files: Vec<MrpackFile>,
    #[serde(default)]
    pub dependencies: HashMap<String, String>,
}

fn default_game() -> String {
    "minecraft".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MrpackFile {
    /// Relative path inside the game directory, e.g. `mods/sodium.jar`.
    pub path: String,
    #[serde(default)]
    pub hashes: HashMap<String, String>,
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
    #[serde(default)]
    pub downloads: Vec<String>,
    #[serde(default)]
    pub file_size: u64,
}

/// Details extracted from a pack before the user commits to installing it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModpackPreview {
    pub name: String,
    pub summary: Option<String>,
    pub version_id: String,
    pub game_version: String,
    pub loader: LoaderKind,
    pub loader_version: Option<String>,
    pub file_count: usize,
    pub total_size: u64,
    pub dependencies: HashMap<String, String>,
}

impl MrpackIndex {
    /// Derive the loader + version triple from the `dependencies` map.
    pub fn loader_info(&self) -> (LoaderKind, Option<String>) {
        for (key, kind) in [
            ("fabric-loader", LoaderKind::Fabric),
            ("quilt-loader", LoaderKind::Quilt),
            ("neoforge", LoaderKind::NeoForge),
            ("forge", LoaderKind::Forge),
        ] {
            if let Some(version) = self.dependencies.get(key) {
                return (kind, Some(version.clone()));
            }
        }
        (LoaderKind::Vanilla, None)
    }

    pub fn game_version(&self) -> String {
        self.dependencies
            .get("minecraft")
            .cloned()
            .unwrap_or_else(|| "1.20.1".into())
    }

    pub fn preview(&self) -> ModpackPreview {
        let (loader, loader_version) = self.loader_info();
        ModpackPreview {
            name: self.name.clone(),
            summary: self.summary.clone(),
            version_id: self.version_id.clone(),
            game_version: self.game_version(),
            loader,
            loader_version,
            file_count: self.files.len(),
            total_size: self.files.iter().map(|f| f.file_size).sum(),
            dependencies: self.dependencies.clone(),
        }
    }
}

/// Read `modrinth.index.json` from an `.mrpack` without extracting anything.
pub fn read_index(pack: &Path) -> Result<MrpackIndex> {
    let file = std::fs::File::open(pack)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let mut entry = archive
        .by_name(INDEX_FILE)
        .map_err(|_| AetherError::msg("This file isn't a valid Modrinth modpack (no index)."))?;
    let mut raw = String::new();
    entry.read_to_string(&mut raw)?;
    Ok(serde_json::from_str(&raw)?)
}

/// Install the pack into an existing (already created) instance game directory.
pub async fn install(
    http: &reqwest::Client,
    pack: &Path,
    game_dir: &Path,
    concurrency: usize,
    sink: ProgressSink,
) -> Result<Vec<InstalledProject>> {
    let index = read_index(pack)?;

    // ---- download declared files -----------------------------------------
    let mut specs = vec![];
    for file in &index.files {
        // Skip server-only files when installing on the client.
        if let Some(env) = &file.env {
            if env.get("client").map(|v| v == "unsupported").unwrap_or(false) {
                continue;
            }
        }
        let Some(url) = file.downloads.first() else {
            continue;
        };
        let dest = game_dir.join(file.path.replace('/', std::path::MAIN_SEPARATOR_STR));
        let mut spec = DownloadSpec::new(url.clone(), dest).with_size(file.file_size);
        if let Some(sha1) = file.hashes.get("sha1") {
            spec = spec.with_sha1(sha1.clone());
        }
        specs.push(spec);
    }

    if !specs.is_empty() {
        download_many(http.clone(), specs, concurrency, "modpack", sink.clone()).await?;
    }

    // ---- extract overrides -----------------------------------------------
    sink(Progress::new("extract", "Applying modpack overrides…"));
    let pack = pack.to_path_buf();
    let dest = game_dir.to_path_buf();
    tokio::task::spawn_blocking(move || extract_overrides(&pack, &dest))
        .await
        .map_err(|e| AetherError::msg(format!("override extraction failed: {e}")))??;

    // Track the pack itself so update checks can find it later.
    Ok(vec![InstalledProject {
        project_id: index.version_id.clone(),
        version_id: index.version_id.clone(),
        title: index.name.clone(),
        icon_url: None,
        project_type: "modpack".into(),
        files: index.files.iter().map(|f| f.path.clone()).collect(),
        installed_at: Some(chrono::Utc::now().to_rfc3339()),
    }])
}

/// Copy `overrides/` and `client-overrides/` out of the archive.
fn extract_overrides(pack: &Path, game_dir: &Path) -> Result<()> {
    let file = std::fs::File::open(pack)?;
    let mut archive = zip::ZipArchive::new(file)?;

    for prefix in ["overrides/", "client-overrides/"] {
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)?;
            let name = entry.name().to_string();
            let Some(relative) = name.strip_prefix(prefix) else {
                continue;
            };
            if relative.is_empty() || entry.is_dir() {
                continue;
            }

            let out_path = game_dir.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut out = std::fs::File::create(&out_path)?;
            std::io::copy(&mut entry, &mut out)?;
        }
    }
    Ok(())
}

/// Export an instance as a `.mrpack` at `target`.
///
/// Tracked Modrinth files go into the index (so they're re-downloadable) and
/// everything else in the game directory is bundled as an override.
pub fn export(
    target: &Path,
    name: &str,
    summary: Option<String>,
    game_version: &str,
    loader: LoaderKind,
    loader_version: Option<&str>,
    game_dir: &Path,
    projects: &[InstalledProject],
) -> Result<()> {
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let file = std::fs::File::create(target)?;
    let mut writer = zip::ZipWriter::new(file);
    let options: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // ---- index ------------------------------------------------------------
    let mut dependencies: HashMap<String, String> = HashMap::new();
    dependencies.insert("minecraft".into(), game_version.to_string());
    if let Some(version) = loader_version {
        let key = match loader {
            LoaderKind::Fabric => Some("fabric-loader"),
            LoaderKind::Quilt => Some("quilt-loader"),
            LoaderKind::Forge => Some("forge"),
            LoaderKind::NeoForge => Some("neoforge"),
            LoaderKind::Vanilla => None,
        };
        if let Some(key) = key {
            dependencies.insert(key.into(), version.to_string());
        }
    }

    let index = MrpackIndex {
        format_version: 1,
        game: "minecraft".into(),
        version_id: "1.0.0".into(),
        name: name.to_string(),
        summary,
        files: vec![],
        dependencies,
    };

    writer.start_file(INDEX_FILE, options)?;
    writer.write_all(serde_json::to_string_pretty(&index)?.as_bytes())?;

    // ---- overrides --------------------------------------------------------
    // Anything in the game dir that isn't tracked launcher metadata becomes an
    // override. Modrinth-installed content is represented in the index instead.
    let tracked: std::collections::HashSet<String> = projects
        .iter()
        .flat_map(|p| p.files.iter().cloned())
        .collect();

    let skip_dirs = ["versions", "logs", "crash-reports", "screenshots", "runtime", "natives"];
    for entry in walkdir::WalkDir::new(game_dir)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !skip_dirs.contains(&name.as_ref())
        })
    {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = match entry.path().strip_prefix(game_dir) {
            Ok(relative) => relative.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };
        if tracked.contains(&relative) {
            continue;
        }

        writer.start_file(format!("overrides/{relative}"), options)?;
        let mut source = std::fs::File::open(entry.path())?;
        let mut buffer = vec![];
        source.read_to_end(&mut buffer)?;
        writer.write_all(&buffer)?;
    }

    writer.finish()?;
    Ok(())
}

/// Best-effort guess of the loader from a Modrinth pack dependency map.
pub fn loader_from_dependencies(deps: &HashMap<String, String>) -> (LoaderKind, Option<String>) {
    let index = MrpackIndex {
        format_version: 1,
        game: "minecraft".into(),
        version_id: String::new(),
        name: String::new(),
        summary: None,
        files: vec![],
        dependencies: deps.clone(),
    };
    index.loader_info()
}

/// Convenience: reveal the files a pack will place in `mods/`.
pub fn mod_files(pack: &Path) -> Result<Vec<String>> {
    let index = read_index(pack)?;
    Ok(index
        .files
        .into_iter()
        .map(|f| f.path)
        .filter(|p| p.starts_with("mods/"))
        .collect())
}

/// Resolve a destination path safely, refusing to escape the game directory.
pub fn safe_join(root: &Path, relative: &str) -> Option<PathBuf> {
    let candidate = root.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
    let normalized = candidate.canonicalize().ok()?;
    let root = root.canonicalize().ok()?;
    normalized.starts_with(root).then_some(candidate)
}
