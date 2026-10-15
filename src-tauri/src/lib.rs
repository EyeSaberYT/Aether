//! Aether — a modern, open-source Minecraft launcher.
//!
//! The crate is split into three layers:
//!
//! * [`core`] – pure launcher logic (auth, instances, Minecraft, Java,
//!   downloads). No Tauri types, fully testable.
//! * [`api`] – remote service clients (Modrinth/Labrinth).
//! * [`commands`] – the thin Tauri command surface the React frontend talks to.

pub mod api;
pub mod commands;
pub mod core;
pub mod error;
pub mod state;

use tauri::Manager;

use crate::core::paths::AppPaths;

/// Sent on every HTTP request so Modrinth/Mojang can identify the launcher.
pub const USER_AGENT: &str = concat!("Aether/", env!("CARGO_PKG_VERSION"), " (github.com/aether-launcher)");

/// Entry point used by both `main.rs` and mobile targets.
pub fn run() {
    let paths = AppPaths::discover();

    // Structured logs help users file useful bug reports.
    let log_dir = paths.root.join("logs");
    let _ = std::fs::create_dir_all(&log_dir);

    let state = match state::AppState::new(paths) {
        Ok(state) => state,
        Err(error) => {
            eprintln!("Aether failed to start: {error}");
            std::process::exit(1);
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(state)
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("Aether");
            }
            log::info!(
                "Aether {} starting on {} ({})",
                env!("CARGO_PKG_VERSION"),
                std::env::consts::OS,
                std::env::consts::ARCH
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ---- auth ------------------------------------------------------
            commands::auth::auth_accounts,
            commands::auth::auth_current,
            commands::auth::auth_login_microsoft,
            commands::auth::auth_login_microsoft_legacy,
            commands::auth::auth_legacy_url,
            commands::auth::auth_login_offline,
            commands::auth::auth_logout,
            commands::auth::auth_set_active,
            // ---- instances -------------------------------------------------
            commands::instance::instance_list,
            commands::instance::instance_get,
            commands::instance::instance_create,
            commands::instance::instance_update,
            commands::instance::instance_rename,
            commands::instance::instance_duplicate,
            commands::instance::instance_delete,
            commands::instance::instance_install_loader,
            commands::instance::instance_content,
            commands::instance::instance_toggle_content,
            commands::instance::instance_delete_content,
            commands::instance::instance_import_files,
            commands::instance::instance_paths,
            commands::instance::instance_content_dir_name,
            commands::instance::instance_default_settings,
            commands::instance::instance_slug,
            commands::instance::modpack_preview,
            commands::instance::modpack_import,
            commands::instance::modpack_export,
            // ---- versions --------------------------------------------------
            commands::versions::versions_list,
            commands::versions::versions_refresh,
            commands::versions::versions_latest,
            commands::versions::loader_versions,
            commands::versions::version_details,
            // ---- launch ----------------------------------------------------
            commands::launch::launch_instance,
            commands::launch::launch_preview,
            commands::launch::launch_logs,
            commands::launch::launch_mark_stopped,
            commands::launch::launch_running,
            // ---- modrinth --------------------------------------------------
            commands::modrinth::modrinth_search,
            commands::modrinth::modrinth_project,
            commands::modrinth::modrinth_projects,
            commands::modrinth::modrinth_versions,
            commands::modrinth::modrinth_tags,
            commands::modrinth::modrinth_install,
            commands::modrinth::modrinth_install_modpack,
            commands::modrinth::modrinth_check_updates,
            commands::modrinth::modrinth_apply_update,
            commands::modrinth::modrinth_update_all,
            commands::modrinth::modrinth_dependencies,
            // ---- java ------------------------------------------------------
            commands::java::java_list,
            commands::java::java_detect,
            commands::java::java_install,
            commands::java::java_requirement,
            // ---- system ----------------------------------------------------
            commands::system::settings_get,
            commands::system::settings_save,
            commands::system::app_info,
            commands::system::system_reveal,
            commands::system::system_open_url,
            commands::system::system_free_space,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aether");
}

/// Convenience for tests and future CLI entry points.
pub fn paths() -> AppPaths {
    AppPaths::discover()
}

/// Re-export for integration tests.
pub use state::AppState as LauncherState;
pub type SharedState = state::AppState;
