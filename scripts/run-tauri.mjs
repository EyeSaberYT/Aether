#!/usr/bin/env node
// Cross-platform launcher for the Tauri CLI that guarantees the correct Rust
// toolchain is used.
//
// On Windows this applies the same fixes as scripts/dev-shell.ps1, but
// automatically so `npm run tauri:dev` / `npm run tauri:build` "just work":
//
//   1. Prefer rustup's MSVC toolchain over any standalone (e.g. Chocolatey GNU)
//      Rust that may shadow it on PATH. Without this, linking fails with
//      "error calling dlltool 'dlltool.exe': program not found".
//   2. Load the Visual Studio developer environment so link.exe / cl.exe are
//      available to the MSVC linker.
//
// On macOS and Linux it simply forwards to the Tauri CLI.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

/**
 * Set an environment variable using a single casing for its key.
 *
 * Windows treats environment names case-insensitively, but a plain JS object
 * can end up holding both `Path` and `PATH`, which confuses child processes
 * (they may only see one). Normalise to the first casing we already know.
 */
function setEnv(env, key, value) {
  for (const existing of Object.keys(env)) {
    if (existing.toLowerCase() === key.toLowerCase() && existing !== key) {
      delete env[existing];
    }
  }
  env[key] = value;
}

/** Return the existing key used for PATH, or a sensible default. */
function pathKey(env) {
  return Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "Path";
}

/** Build an environment with the MSVC toolchain and VS dev shell on Windows. */
function windowsEnv() {
  const env = { ...process.env };

  // 1. Import the Visual Studio developer environment (link.exe, cl.exe, ...).
  const programFilesX86 = env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const vswhere = path.join(
    programFilesX86,
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  if (existsSync(vswhere)) {
    const query = spawnSync(
      vswhere,
      ["-latest", "-products", "*", "-property", "installationPath"],
      { encoding: "utf8" },
    );
    const install = (query.stdout ?? "").trim().split(/\r?\n/)[0];
    if (install) {
      const devCmd = path.join(install, "Common7", "Tools", "VsDevCmd.bat");
      if (existsSync(devCmd)) {
        const dump = spawnSync(
          "cmd",
          ["/c", `"${devCmd}" -arch=amd64 -host_arch=amd64 >nul && set`],
          { encoding: "utf8" },
        );
        for (const line of (dump.stdout ?? "").split(/\r?\n/)) {
          const eq = line.indexOf("=");
          if (eq > 0) setEnv(env, line.slice(0, eq), line.slice(eq + 1));
        }
      }
    }
  }

  // 2. Put rustup's MSVC toolchain ahead of any shadowing Rust install. This
  //    is done last so it wins over the PATH value loaded from VsDevCmd.
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  const msvcBin = path.join(
    os.homedir(),
    ".rustup",
    "toolchains",
    `stable-${arch}-pc-windows-msvc`,
    "bin",
  );
  if (existsSync(msvcBin)) {
    const key = pathKey(env);
    setEnv(env, key, `${msvcBin};${env[key] ?? ""}`);
  }

  return env;
}

// Run the Tauri CLI through the *current* Node binary so we never depend on
// `node` being discoverable on PATH inside the modified environment.
const cli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
if (!existsSync(cli)) {
  console.error(
    `[run-tauri] Tauri CLI not found at ${cli}. Run "npm install" first.`,
  );
  process.exit(1);
}

const env = isWindows ? windowsEnv() : process.env;
const { status, error } = spawnSync(
  process.execPath,
  [cli, ...process.argv.slice(2)],
  { stdio: "inherit", env, cwd: root },
);

if (error) {
  console.error(`[run-tauri] failed to launch Tauri CLI: ${error.message}`);
  process.exit(1);
}

process.exit(status ?? 1);
