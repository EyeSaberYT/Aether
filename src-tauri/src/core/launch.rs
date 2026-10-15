//! End-to-end launch pipeline: resolve → install → spawn → watch.
//!
//! This module is deliberately framework-agnostic; the Tauri command layer just
//! wires it up and forwards progress events to the UI.

use std::path::PathBuf;
use std::process::Stdio;

use tokio::io::AsyncWriteExt;

use super::auth::Account;
use super::config::Settings;
use super::download::{Progress, ProgressSink};
use super::instance::{self, Instance};
use super::java;
use super::minecraft::{self, LaunchContext};
use super::paths::AppPaths;
use crate::error::{AetherError, Result};

/// Everything needed to start a game process.
pub struct LaunchRequest<'a> {
    pub http: &'a reqwest::Client,
    pub paths: &'a AppPaths,
    pub instance: &'a Instance,
    pub account: &'a Account,
    pub settings: &'a Settings,
    pub sink: ProgressSink,
    /// Skip launching and just return the command (used by "preview command").
    pub dry_run: bool,
}

/// A successfully started game process.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchedProcess {
    pub pid: u32,
    pub log_file: String,
    pub command: String,
    pub arguments: Vec<String>,
}

/// Run the full pipeline and start the game.
pub async fn launch(request: LaunchRequest<'_>) -> Result<LaunchedProcess> {
    let LaunchRequest {
        http,
        paths,
        instance,
        account,
        settings,
        sink,
        dry_run,
    } = request;

    if account.is_expired() {
        return Err(AetherError::Auth(
            "Your session expired. Please sign in again.".into(),
        ));
    }

    let game_dir = instance::game_dir(paths, instance);
    std::fs::create_dir_all(&game_dir)?;

    // ---- 1. resolve the version ------------------------------------------
    sink(Progress::new("resolve", "Resolving game version…"));
    let version = minecraft::resolve(
        http,
        paths,
        &instance.game_version,
        instance.loader,
        instance.loader_version.as_deref(),
    )
    .await?;

    // ---- 2. make sure Java is available ----------------------------------
    let required = version
        .java_version
        .as_ref()
        .map(|j| java::required_major(&j.component, j.major_version))
        .unwrap_or(8);

    sink(Progress::new("java", format!("Looking for Java {required}…")));
    let explicit = instance
        .settings
        .java_path
        .clone()
        .or_else(|| settings.java_path.clone());

    let mut runtime = java::detect(paths, explicit.as_deref(), required).await;
    if runtime.as_ref().map(|r| r.major < required).unwrap_or(true) {
        sink(Progress::new(
            "java",
            format!("Java {required} is missing — downloading it for you…"),
        ));
        runtime = Some(java::install(http, paths, required, sink.clone()).await?);
    }
    let runtime = runtime.ok_or_else(|| {
        AetherError::msg(format!(
            "Java {required} is required but couldn't be found or installed."
        ))
    })?;

    // ---- 3. install files ------------------------------------------------
    sink(Progress::new("install", "Checking game files…"));
    let installed = minecraft::ensure_files(
        http,
        paths,
        &version,
        &instance.game_version,
        settings.concurrent_downloads.max(1),
        sink.clone(),
    )
    .await?;

    // ---- 4. build the command -------------------------------------------
    let mut jvm_args = settings.default_jvm_args.clone();
    jvm_args.extend(instance.settings.jvm_args.clone());

    let ctx = LaunchContext {
        version: installed.version.clone(),
        base_version: instance.game_version.clone(),
        game_dir: game_dir.clone(),
        assets_dir: paths.assets_dir(),
        asset_index: installed.asset_index.clone(),
        natives_dir: installed.natives_dir.clone(),
        classpath: installed.classpath.clone(),
        username: account.username.clone(),
        uuid: account.uuid.replace('-', ""),
        access_token: account.access_token.clone(),
        user_type: account.user_type().to_string(),
        width: instance.settings.width,
        height: instance.settings.height,
        fullscreen: instance.settings.fullscreen,
        memory_min: instance.settings.memory_min,
        memory_max: instance.settings.memory_max,
        extra_jvm_args: jvm_args,
        extra_game_args: instance.settings.game_args.clone(),
        quick_play: instance.settings.quick_play.clone(),
    };

    let (_program, args) = minecraft::build_command(&ctx)?;
    let java_path = runtime.as_path();

    if dry_run {
        return Ok(LaunchedProcess {
            pid: 0,
            log_file: String::new(),
            command: java_path.to_string_lossy().to_string(),
            arguments: args,
        });
    }

    // ---- 5. spawn --------------------------------------------------------
    sink(Progress::new("launch", "Starting Minecraft…"));

    let logs_dir = paths.instance_dir(&instance.id).join("logs");
    std::fs::create_dir_all(&logs_dir)?;
    let log_file = logs_dir.join(format!(
        "launch-{}.log",
        chrono::Local::now().format("%Y%m%d-%H%M%S")
    ));

    let mut command = tokio::process::Command::new(&java_path);
    command
        .args(&args)
        .current_dir(&game_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    for (key, value) in &instance.settings.env {
        command.env(key, value);
    }

    #[cfg(windows)]
    {
        // Don't pop up a console window for the game process.
        command.creation_flags(0x0800_0000);
    }

    let mut child = command
        .spawn()
        .map_err(|e| AetherError::Launch(format!("Couldn't start Java: {e}")))?;

    let pid = child.id().unwrap_or(0);

    // Stream stdout/stderr into a log file so the crash viewer has something to
    // show. Each stream gets its own task so output stays live.
    if let Some(stdout) = child.stdout.take() {
        let path = log_file.clone();
        tokio::spawn(async move {
            if let Ok(mut file) = tokio::fs::File::create(&path).await {
                let _ = tokio::io::copy(&mut { stdout }, &mut file).await;
                let _ = file.flush().await;
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let path = log_file.clone();
        tokio::spawn(async move {
            if let Ok(mut file) = tokio::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&path)
                .await
            {
                let _ = tokio::io::copy(&mut { stderr }, &mut file).await;
                let _ = file.flush().await;
            }
        });
    }

    // Reap the child in the background so we don't leave a zombie.
    let watched = instance.id.clone();
    let paths_clone = paths.clone();
    tokio::spawn(async move {
        let exit = child.wait().await;
        match exit {
            Ok(status) => {
                log::info!("instance {watched} exited with {status}");
                // Bump play time if we can.
                if let Ok(mut store) = instance::InstanceStore::load(&paths_clone) {
                    if let Ok(instance) = store.get_mut(&watched) {
                        instance.last_played = Some(chrono::Utc::now().to_rfc3339());
                    }
                    let _ = store.save(&paths_clone);
                }
            }
            Err(error) => log::warn!("failed to wait for instance {watched}: {error}"),
        }
    });

    sink(Progress {
        stage: "launch".into(),
        label: "Minecraft is running".into(),
        current: 1,
        total: 1,
        files_done: 1,
        files_total: 1,
        finished: true,
    });

    Ok(LaunchedProcess {
        pid,
        log_file: log_file.to_string_lossy().to_string(),
        command: java_path.to_string_lossy().to_string(),
        arguments: args,
    })
}

/// Read the tail of the most recent log for an instance.
pub fn read_latest_log(paths: &AppPaths, instance_id: &str, lines: usize) -> Result<Option<String>> {
    let logs_dir: PathBuf = paths.instance_dir(instance_id).join("logs");
    let mut entries: Vec<_> = std::fs::read_dir(&logs_dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "log")
                .unwrap_or(false)
        })
        .collect();

    entries.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());
    let Some(latest) = entries.last() else {
        return Ok(None);
    };

    let content = std::fs::read_to_string(latest.path())?;
    let tail: Vec<&str> = content.lines().rev().take(lines).collect();
    Ok(Some(tail.into_iter().rev().collect::<Vec<_>>().join("\n")))
}

/// Loader + version summary for the instance card.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceSummary {
    pub id: String,
    pub name: String,
    pub game_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub icon: Option<String>,
    pub last_played: Option<String>,
    pub play_time_secs: u64,
    pub mod_count: usize,
    pub installed: bool,
}

/// Build a UI-friendly summary for an instance.
pub fn summarize(paths: &AppPaths, instance: &Instance) -> InstanceSummary {
    let game_dir = instance::game_dir(paths, instance);
    let mods = game_dir.join("mods");
    let mod_count = std::fs::read_dir(&mods)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "jar")
                .unwrap_or(false)
        })
        .count();

    InstanceSummary {
        id: instance.id.clone(),
        name: instance.name.clone(),
        game_version: instance.game_version.clone(),
        loader: instance.loader.as_str().to_string(),
        loader_version: instance.loader_version.clone(),
        icon: instance.icon.clone(),
        last_played: instance.last_played.clone(),
        play_time_secs: instance.play_time_secs,
        mod_count,
        installed: minecraft::resolve_cached(paths, instance).is_some(),
    }
}
