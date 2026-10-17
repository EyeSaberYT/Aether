//! Instance lifecycle + content (mods / packs) management commands.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::core::instance::{
    self, game_dir, slugify, Instance, InstanceSettings, InstalledProject, LoaderKind,
};
use crate::core::minecraft::loader;
use crate::core::modpack;
use crate::core::{java, launch};
use crate::error::{AetherError, Result};
use crate::state::AppState;

/// Payload used when creating a new instance.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInstanceArgs {
    pub name: String,
    pub game_version: String,
    #[serde(default)]
    pub loader: LoaderKind,
    pub loader_version: Option<String>,
    pub icon: Option<String>,
    pub group: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// Install the loader profile immediately.
    #[serde(default)]
    pub install_loader: bool,
}

#[tauri::command]
pub async fn instance_list(state: State<'_, AppState>) -> Result<Vec<launch::InstanceSummary>> {
    let store = state.instances.read().await;
    Ok(store
        .instances
        .iter()
        .map(|i| launch::summarize(&state.paths, i))
        .collect())
}

#[tauri::command]
pub async fn instance_get(state: State<'_, AppState>, id: String) -> Result<Instance> {
    Ok(state.instances.read().await.get(&id)?.clone())
}

#[tauri::command]
pub async fn instance_create(
    app: AppHandle,
    state: State<'_, AppState>,
    args: CreateInstanceArgs,
) -> Result<Instance> {
    let name = args.name.trim();
    if name.is_empty() {
        return Err(AetherError::msg("Give your instance a name."));
    }

    let mut instance = Instance::new(name, &args.game_version, args.loader);
    instance.icon = args.icon;
    instance.group = args.group;
    instance.tags = args.tags;
    instance.loader_version = args.loader_version.clone();

    // Inherit global defaults so new instances feel consistent.
    {
        let settings = state.settings.read().await;
        instance.settings.memory_min = settings.default_memory_min;
        instance.settings.memory_max = settings.default_memory_max;
    }

    let dir = game_dir(&state.paths, &instance);
    std::fs::create_dir_all(&dir)?;
    for sub in ["mods", "resourcepacks", "shaderpacks", "saves", "logs"] {
        std::fs::create_dir_all(dir.join(sub))?;
    }

    // Install the loader up front when requested.
    if args.install_loader && instance.loader != LoaderKind::Vanilla {
        let loader_version = match instance.loader_version.clone() {
            Some(version) => version,
            None => {
                let versions =
                    loader::list_loader_versions(&state.http, instance.loader, &instance.game_version)
                        .await?;
                versions
                    .iter()
                    .find(|v| v.stable)
                    .or_else(|| versions.first())
                    .map(|v| v.version.clone())
                    .ok_or_else(|| {
                        AetherError::msg(format!(
                            "No {} build is available for Minecraft {}.",
                            instance.loader.as_str(),
                            instance.game_version
                        ))
                    })?
            }
        };

        // Forge-family installers need a Java runtime of their own.
        let java_path = match instance.loader {
            LoaderKind::Forge | LoaderKind::NeoForge => java::detect(&state.paths, None, 17)
                .await
                .map(|r| r.as_path())
                .ok_or_else(|| AetherError::msg("Installing Forge requires Java 17 or newer."))?,
            _ => PathBuf::from("java"),
        };

        loader::install_loader(
            &state.http,
            &state.paths,
            &dir,
            instance.loader,
            &instance.game_version,
            &loader_version,
            &java_path,
            state.sink(&app),
        )
        .await?;

        instance.loader_version = Some(loader_version);
    }

    {
        let mut store = state.instances.write().await;
        store.instances.push(instance.clone());
        store.persist(&state.paths, &instance.id)?;
    }
    Ok(instance)
}

#[tauri::command]
pub async fn instance_update(state: State<'_, AppState>, instance: Instance) -> Result<Instance> {
    let mut store = state.instances.write().await;
    *store.get_mut(&instance.id)? = instance.clone();
    store.persist(&state.paths, &instance.id)?;
    Ok(instance)
}

#[tauri::command]
pub async fn instance_rename(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<Instance> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AetherError::msg("The instance name can't be empty."));
    }
    let mut store = state.instances.write().await;
    let instance = {
        let entry = store.get_mut(&id)?;
        entry.name = name;
        entry.clone()
    };
    store.persist(&state.paths, &id)?;
    Ok(instance)
}

#[tauri::command]
pub async fn instance_duplicate(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
) -> Result<Instance> {
    let source = state.instances.read().await.get(&id)?.clone();

    let mut copy = source.clone();
    copy.id = instance::new_id();
    copy.name = name.unwrap_or_else(|| format!("{} (copy)", source.name));
    copy.created = chrono::Utc::now().to_rfc3339();
    copy.last_played = None;
    copy.play_time_secs = 0;

    // Recursively copy the game directory (minus caches and logs).
    copy_game_dir(
        &game_dir(&state.paths, &source),
        &state.paths.instance_game_dir(&copy.id),
    )?;

    {
        let mut store = state.instances.write().await;
        store.instances.push(copy.clone());
        store.persist(&state.paths, &copy.id)?;
    }
    Ok(copy)
}

/// Copy a directory tree, skipping regenerable folders.
fn copy_game_dir(from: &std::path::Path, to: &std::path::Path) -> Result<()> {
    std::fs::create_dir_all(to)?;
    let skip = ["logs", "crash-reports", "screenshots", ".cache"];
    for entry in walkdir::WalkDir::new(from)
        .into_iter()
        .filter_entry(|e| {
            !(e.depth() == 1 && skip.contains(&e.file_name().to_string_lossy().as_ref()))
        })
    {
        let entry = entry.map_err(|e| AetherError::msg(e.to_string()))?;
        let relative = entry
            .path()
            .strip_prefix(from)
            .map_err(|_| AetherError::msg("invalid path"))?;
        let target = to.join(relative);

        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&target)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn instance_delete(
    state: State<'_, AppState>,
    id: String,
    delete_files: bool,
) -> Result<()> {
    {
        let mut store = state.instances.write().await;
        store.instances.retain(|i| i.id != id);
        store.save(&state.paths)?;
    }
    if delete_files {
        let dir = state.paths.instance_dir(&id);
        if dir.exists() {
            std::fs::remove_dir_all(&dir)?;
        }
    }
    Ok(())
}

/// Install (or reinstall) the loader for an existing instance.
#[tauri::command]
pub async fn instance_install_loader(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    loader_version: Option<String>,
) -> Result<Instance> {
    let (instance, dir) = {
        let store = state.instances.read().await;
        let instance = store.get(&id)?.clone();
        let dir = game_dir(&state.paths, &instance);
        (instance, dir)
    };

    if instance.loader == LoaderKind::Vanilla {
        return Err(AetherError::msg(
            "Vanilla instances don't need a loader installed.",
        ));
    }

    let resolved = match loader_version {
        Some(version) => version,
        None => {
            let versions =
                loader::list_loader_versions(&state.http, instance.loader, &instance.game_version)
                    .await?;
            versions
                .iter()
                .find(|v| v.stable)
                .or_else(|| versions.first())
                .map(|v| v.version.clone())
                .ok_or_else(|| {
                    AetherError::msg(format!(
                        "No {} build is available for Minecraft {}.",
                        instance.loader.as_str(),
                        instance.game_version
                    ))
                })?
        }
    };

    let java_path = match instance.loader {
        LoaderKind::Forge | LoaderKind::NeoForge => java::detect(&state.paths, None, 17)
            .await
            .map(|r| r.as_path())
            .ok_or_else(|| AetherError::msg("Installing Forge requires Java 17 or newer."))?,
        _ => PathBuf::from("java"),
    };

    loader::install_loader(
        &state.http,
        &state.paths,
        &dir,
        instance.loader,
        &instance.game_version,
        &resolved,
        &java_path,
        state.sink(&app),
    )
    .await?;

    let mut updated = instance;
    updated.loader_version = Some(resolved);

    {
        let mut store = state.instances.write().await;
        store.get_mut(&id)?.loader_version = updated.loader_version.clone();
        store.persist(&state.paths, &id)?;
    }

    Ok(updated)
}

// ---------------------------------------------------------------------------
// Content management
// ---------------------------------------------------------------------------

/// One file inside an instance's content folders.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentEntry {
    pub name: String,
    pub path: String,
    pub enabled: bool,
    pub size: u64,
    /// `mod`, `resourcepack`, `shader`, `datapack`.
    pub kind: String,
    pub project_id: Option<String>,
    pub version_id: Option<String>,
    pub title: Option<String>,
    pub icon_url: Option<String>,
}

fn content_kind(folder: &str) -> &'static str {
    match folder {
        "resourcepacks" => "resourcepack",
        "shaderpacks" => "shader",
        "datapacks" => "datapack",
        _ => "mod",
    }
}

/// Compare a tracked (possibly nested) path against a bare filename.
fn filename_matches(tracked: &str, file_name: &str) -> bool {
    tracked
        .rsplit('/')
        .next()
        .map(|name| name == file_name)
        .unwrap_or(false)
}

#[tauri::command]
pub async fn instance_content(state: State<'_, AppState>, id: String) -> Result<Vec<ContentEntry>> {
    let instance = state.instances.read().await.get(&id)?.clone();
    let dir = game_dir(&state.paths, &instance);

    let mut out = vec![];
    for folder in ["mods", "resourcepacks", "shaderpacks", "datapacks"] {
        let Ok(entries) = std::fs::read_dir(dir.join(folder)) else {
            continue;
        };
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.starts_with('.') {
                continue;
            }

            // Accept `x.jar`, `x.zip` and their disabled variants.
            let base = file_name.trim_end_matches(".disabled");
            if !base.ends_with(".jar") && !base.ends_with(".zip") {
                continue;
            }

            let tracked = instance.installed_projects.iter().find(|p| {
                p.files
                    .iter()
                    .any(|f| filename_matches(f, &file_name) || filename_matches(f, base))
            });

            out.push(ContentEntry {
                name: file_name.clone(),
                path: entry.path().to_string_lossy().to_string(),
                enabled: !file_name.ends_with(".disabled"),
                size: entry.metadata().map(|m| m.len()).unwrap_or(0),
                kind: content_kind(folder).to_string(),
                project_id: tracked.map(|p| p.project_id.clone()),
                version_id: tracked.map(|p| p.version_id.clone()),
                title: tracked.map(|p| p.title.clone()),
                icon_url: tracked.and_then(|p| p.icon_url.clone()),
            });
        }
    }

    Ok(out)
}

/// Enable or disable a content file by toggling its `.disabled` suffix.
#[tauri::command]
pub async fn instance_toggle_content(
    state: State<'_, AppState>,
    id: String,
    path: String,
    enabled: bool,
) -> Result<String> {
    let instance = state.instances.read().await.get(&id)?.clone();
    let root = game_dir(&state.paths, &instance);
    let source = PathBuf::from(&path);

    // Guard against path traversal: the file must live inside the instance.
    if !source.starts_with(&root) {
        return Err(AetherError::msg("That file isn't part of this instance."));
    }

    let target = if enabled {
        PathBuf::from(source.to_string_lossy().trim_end_matches(".disabled").to_string())
    } else {
        PathBuf::from(format!("{}.disabled", source.to_string_lossy()))
    };

    if source.exists() {
        std::fs::rename(&source, &target)?;
    }
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn instance_delete_content(
    state: State<'_, AppState>,
    id: String,
    path: String,
) -> Result<()> {
    let instance = state.instances.read().await.get(&id)?.clone();
    let root = game_dir(&state.paths, &instance);
    let target = PathBuf::from(&path);

    if !target.starts_with(&root) {
        return Err(AetherError::msg("That file isn't part of this instance."));
    }
    if target.exists() {
        std::fs::remove_file(target)?;
    }
    Ok(())
}

/// Import loose `.jar`/`.zip` files dropped onto the instance (drag & drop).
#[tauri::command]
pub async fn instance_import_files(
    state: State<'_, AppState>,
    id: String,
    paths: Vec<String>,
    folder: Option<String>,
) -> Result<usize> {
    let instance = state.instances.read().await.get(&id)?.clone();
    let dest_dir = game_dir(&state.paths, &instance).join(folder.unwrap_or_else(|| "mods".into()));
    std::fs::create_dir_all(&dest_dir)?;

    let mut copied = 0;
    for path in paths {
        let source = PathBuf::from(&path);
        if !source.is_file() {
            continue;
        }
        let name = source
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .ok_or_else(|| AetherError::msg("invalid file name"))?;
        std::fs::copy(&source, dest_dir.join(name))?;
        copied += 1;
    }
    Ok(copied)
}

/// The directories the UI may reveal in the OS file manager.
#[tauri::command]
pub async fn instance_paths(
    state: State<'_, AppState>,
    id: String,
) -> Result<std::collections::HashMap<String, String>> {
    let instance = state.instances.read().await.get(&id)?.clone();
    let root = game_dir(&state.paths, &instance);

    let mut map = std::collections::HashMap::new();
    map.insert("game".into(), root.to_string_lossy().to_string());
    map.insert(
        "instance".into(),
        state.paths.instance_dir(&id).to_string_lossy().to_string(),
    );
    map.insert(
        "logs".into(),
        state
            .paths
            .instance_dir(&id)
            .join("logs")
            .to_string_lossy()
            .to_string(),
    );
    for folder in ["mods", "resourcepacks", "shaderpacks", "saves"] {
        map.insert(folder.into(), root.join(folder).to_string_lossy().to_string());
    }
    Ok(map)
}

/// Resolve the Modrinth-style content directory for a project type.
#[tauri::command]
pub fn instance_content_dir_name(project_type: String) -> String {
    match project_type.as_str() {
        "resourcepack" => "resourcepacks".into(),
        "shader" => "shaderpacks".into(),
        "datapack" => "datapacks".into(),
        _ => "mods".into(),
    }
}

/// Expose default settings so the new-instance dialog can prefill them.
#[tauri::command]
pub async fn instance_default_settings(state: State<'_, AppState>) -> Result<InstanceSettings> {
    let settings = state.settings.read().await;
    let mut defaults = InstanceSettings::default();
    defaults.memory_min = settings.default_memory_min;
    defaults.memory_max = settings.default_memory_max;
    Ok(defaults)
}

/// A generated, filesystem-friendly folder name for a new instance.
#[tauri::command]
pub fn instance_slug(name: String) -> String {
    slugify(&name)
}

// ---------------------------------------------------------------------------
// Modpacks
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn modpack_preview(
    _state: State<'_, AppState>,
    path: String,
) -> Result<modpack::ModpackPreview> {
    Ok(modpack::read_index(&PathBuf::from(path))?.preview())
}

/// Create a new instance from a local `.mrpack` and install it.
#[tauri::command]
pub async fn modpack_import(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: Option<String>,
) -> Result<Instance> {
    let pack = PathBuf::from(&path);
    let index = modpack::read_index(&pack)?;
    let (loader, loader_version) = index.loader_info();
    let game_version = index.game_version();

    let mut instance = Instance::new(
        name.unwrap_or_else(|| index.name.clone()),
        &game_version,
        loader,
    );
    instance.loader_version = loader_version.clone();
    instance.notes = index.summary.clone();

    let dir = game_dir(&state.paths, &instance);
    std::fs::create_dir_all(&dir)?;

    // Install the loader first so the pack lands in a working instance.
    if let Some(version) = loader_version.as_deref() {
        if loader != LoaderKind::Vanilla {
            let java_path = match loader {
                LoaderKind::Forge | LoaderKind::NeoForge => java::detect(&state.paths, None, 17)
                    .await
                    .map(|r| r.as_path())
                    .unwrap_or_else(|| PathBuf::from("java")),
                _ => PathBuf::from("java"),
            };
            loader::install_loader(
                &state.http,
                &state.paths,
                &dir,
                loader,
                &game_version,
                version,
                &java_path,
                state.sink(&app),
            )
            .await?;
        }
    }

    let concurrency = state.settings.read().await.concurrent_downloads;
    let mut projects = modpack::install(
        &state.http,
        &state.modrinth_base().await,
        &pack,
        &dir,
        concurrency,
        state.sink(&app),
    )
    .await?;

    // A file on disk carries no Modrinth ids, so the pack itself can only be
    // remembered by name — enough to say where the instance came from, and
    // skipped by update checks, which need a real id.
    projects.push(InstalledProject {
        project_id: String::new(),
        version_id: index.version_id.clone(),
        title: index.name.clone(),
        icon_url: None,
        project_type: "modpack".into(),
        files: vec![],
        installed_at: Some(chrono::Utc::now().to_rfc3339()),
    });
    instance.installed_projects = projects;

    {
        let mut store = state.instances.write().await;
        store.instances.push(instance.clone());
        store.persist(&state.paths, &instance.id)?;
    }
    Ok(instance)
}

/// Export an instance to a `.mrpack`.
#[tauri::command]
pub async fn modpack_export(
    state: State<'_, AppState>,
    id: String,
    target: String,
) -> Result<String> {
    let instance = state.instances.read().await.get(&id)?.clone();
    let dir = game_dir(&state.paths, &instance);

    modpack::export(
        &PathBuf::from(&target),
        &instance.name,
        instance.notes.clone(),
        &instance.game_version,
        instance.loader,
        instance.loader_version.as_deref(),
        &dir,
        &instance.installed_projects,
    )?;
    Ok(target)
}
