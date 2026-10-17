//! Core launcher logic, free of any Tauri types.
//!
//! Keeping this layer framework-agnostic means it can be unit tested and
//! reused (e.g. from a future CLI) without dragging in the GUI.

pub mod auth;
pub mod config;
pub mod download;
pub mod instance;
pub mod java;
pub mod launch;
pub mod minecraft;
pub mod modpack;
pub mod paths;
pub mod scan;
