# Aether

[![Latest release](https://img.shields.io/github/v/release/EyeSaberYT/Aether?sort=semver&style=flat-square)](https://github.com/EyeSaberYT/Aether/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/EyeSaberYT/Aether/total?style=flat-square)](https://github.com/EyeSaberYT/Aether/releases)
[![License: MIT](https://img.shields.io/github/license/EyeSaberYT/Aether?style=flat-square)](LICENSE)

A modern, open-source, ad-free Minecraft launcher for Windows, macOS and Linux —
built as a Tauri 2 desktop app with a React + TypeScript front end and a Rust core.

Aether is inspired by the [Modrinth App](https://modrinth.com/app): a clean,
dark-mode-first interface, first-class mod-loader support and deep Modrinth
integration, with none of the telemetry, ads or bundled junk found in legacy
launchers.

> **Status:** early development (`0.1.6-fix`). Instance management, launching,
> Modrinth and CurseForge browsing, the in-game server list, screenshots and
> world backups, importing from other launchers, the skin viewer/changer and
> the in-app updater work end to end.
> Microsoft sign-in works with the built-in client id, which Mojang has
> allow-listed — see [Enabling Microsoft sign-in](#enabling-microsoft-sign-in) —
> and offline profiles always work. The code is production-oriented and fully
> typed, but expect rough edges.

---

## Download

Grab the latest build from the [**Releases page**](https://github.com/EyeSaberYT/Aether/releases/latest).
Every artifact is produced and signed by GitHub Actions from the tagged source.

| Platform                       | File                      | How to install                                                                            |
| ------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------- |
| **Windows**                    | `Aether_*_x64-setup.exe`  | Run it — installs Aether and adds a Start-menu entry. A `.msi` is published alongside it. |
| **Linux** (any distribution)   | `Aether_*_amd64.AppImage` | `chmod +x Aether_*.AppImage && ./Aether_*.AppImage` — self-contained, nothing to install. |
| **Linux** (Debian/Ubuntu/Mint) | `Aether_*_amd64.deb`      | `sudo apt install ./Aether_*_amd64.deb`                                                   |
| **Linux** (Fedora/RHEL/SUSE)   | `Aether-*.x86_64.rpm`     | `sudo dnf install ./Aether-*.x86_64.rpm`                                                  |
| **macOS** (Apple silicon)      | `Aether_*_aarch64.dmg`    | Open the `.dmg` and drag Aether into Applications.                                        |

Requires Windows 10+, macOS 10.15+ or a modern Linux desktop.

> **Updates are built in.** Aether checks for a new release on startup and from
> **Settings → Updates**, then downloads it and verifies its signature before
> installing. You can always update by hand from the Releases page instead.

> **Why the warnings?** The installers are not code-signed, so Windows SmartScreen
> may flag an unknown publisher and macOS Gatekeeper may need a right-click →
> **Open** the first time. There is currently no Intel (x86_64) macOS build.

---

## Features

### Accounts
- **Microsoft sign-in** using the OAuth 2.0 **device-code flow** — no client
  secret and no local callback server.
- **Offline profiles** for single-player and mod testing, clearly marked as such.
- Multiple accounts with one-click switching.
- **Skin viewer and changer**: a rotating 3D preview of what your character
  wears, plus upload for accounts that own the game.

### Instances
- Create, rename, duplicate and delete instances.
- Choose any Minecraft version (releases, snapshots and old betas) plus a loader:
  **Vanilla, Fabric, Quilt, Forge or NeoForge**.
- Automatic loader installation (Fabric/Quilt via their profile JSON; Forge and
  NeoForge via their official installers).
- Per-instance **memory**, **JVM arguments**, **game arguments**, **Java runtime**,
  **game directory**, **window size**, **fullscreen** and **Quick Play**.
- Custom icons, groups, tags and notes.
- **Import instances** from other launchers — Prism, MultiMC, CurseForge, the
  vanilla launcher and the Modrinth App — keeping worlds, settings and icons;
  the other launcher's files are left untouched.
- Per-instance **multiplayer server list** editing, a **screenshot browser**
  and **world backups** you can create and restore.
- Import and export **`.mrpack`** modpacks.
- A crash/launch **log viewer**.

### Mod browsing — Modrinth & CurseForge
- Search mods, modpacks, resource packs, shaders and datapacks on Modrinth
  or CurseForge; switch catalogs from the Discover page.
- Filter by game version, loader and sort order; browse project pages with
  gallery, description, metadata and version history.
- One-click install with **automatic dependency resolution**.
- **Update checks** for installed projects, with one-click apply.
- Install modpacks (`.mrpack` and CurseForge `.zip`) straight into a new,
  correctly-configured instance.

### Content management
- Inspect every installed mod/pack per instance.
- Enable and disable content without deleting it.
- Delete content.
- **Drag and drop** `.jar` / `.zip` files into the window to install them.

### Java
- Detects installed runtimes.
- Downloads the correct Mojang-provided runtime automatically when a version
  needs one.

### Extras
- Signed, in-app updates — Aether checks for a new release on startup and from
  Settings, then verifies the download's signature before installing it.
- Dark, light and system themes.
- Keyboard-friendly, animation-rich UI with live download progress.

---

## Tech stack

| Layer          | Choice                                                   |
| -------------- | -------------------------------------------------------- |
| Desktop shell  | [Tauri 2](https://tauri.app)                             |
| UI             | React 18 + TypeScript + Vite                             |
| Styling        | Tailwind CSS + [shadcn/ui](https://ui.shadcn.com)-style primitives |
| State          | [Zustand](https://zustand-demo.pmnd.rs)                  |
| Icons          | [Lucide](https://lucide.dev)                             |
| Toasts         | [Sonner](https://sonner.emilkowal.ski)                   |
| Backend        | Rust (`tokio`, `reqwest` with rustls, `serde`)           |

---

## Architecture

Aether keeps a hard boundary between UI and launcher logic.

```
src/                      React front end
  components/ui/          Unstyled-behaviour primitives (shadcn pattern)
  components/…            Feature components (instances, discover, accounts…)
  pages/                  Route screens
  store/                  Zustand stores (settings, accounts, instances, progress)
  lib/api.ts              Typed wrappers for every backend command
  lib/tauri.ts            The single source of truth for IPC types

src-tauri/src/
  core/                   Framework-free launcher logic
    auth/                 Microsoft device-code + offline accounts
    minecraft/            Version manifest, resolution, loaders, launching
    instance.rs           Instance model, persistence, on-disk store
    download.rs           Parallel downloader with progress events
    java.rs               Runtime detection + Mojang runtime install
    launch.rs             End-to-end launch pipeline
    modpack.rs            .mrpack import/export
    cfpack.rs             CurseForge pack manifest + install
  api/modrinth.rs         Typed Labrinth (Modrinth API v2) client
  api/curseforge.rs       Typed CurseForge API client
  commands/               Thin Tauri command surface (the IPC boundary)
  state.rs                Shared `AppState`
  error.rs                One `AetherError` type, serialized as a string
```

**Data flow.** React calls a function in `src/lib/api.ts`, which invokes a Tauri
command. The command delegates to `core/`, which never depends on Tauri. Long
operations stream progress over the `download://progress` event; the Microsoft
device-code prompt arrives on `auth://device-code`; and a running game streams
its console over `game://output`, followed by `game://exit` when it stops.

**On-disk layout** — one dot-prefixed folder holding everything (e.g.
`%APPDATA%\.aether` on Windows), the way the Modrinth App keeps its data:

```
.aether/
  config.json          global settings
  accounts.json        cached accounts
  instances.json       instance index
  instances/<id>/
    instance.json      per-instance settings
    (game files)       the game directory: mods/, logs/, saves/, …
  meta/                cached Mojang metadata
  java/                launcher-managed runtimes
  cache/               downloads & asset cache
  logs/                launcher + game logs
```

Data written by earlier versions (`Aether/`) is moved into `.aether`
automatically on first start. Instances that still keep their game files in a
nested `.minecraft/` folder are flattened into the instance folder the same
way. Set `AETHER_DATA_DIR` to relocate everything.

---

## Getting started

### Prerequisites

- **Node.js 20+** and npm
- **Rust** (stable) via [rustup](https://rustup.rs)
- Platform build tools:
  - **Windows:** Visual Studio Build Tools with the *Desktop development with C++*
    workload
  - **macOS:** Xcode Command Line Tools
  - **Linux:** `webkit2gtk-4.1`, `libappindicator3`, `librsvg2` and friends — see
    the [Tauri prerequisites](https://tauri.app/start/prerequisites/)

### Install & run

```bash
npm install
npm run tauri:dev      # launch the full desktop app with hot reload
```

Other useful scripts:

```bash
npm run dev            # Vite dev server only (UI in a browser; no backend)
npm run build          # typecheck + production front-end build
npm run typecheck      # tsc --noEmit
npm run tauri:build    # build a distributable installer
```

> **Windows note.** If a standalone (e.g. Chocolatey) GNU Rust shadows rustup's
> MSVC toolchain, Cargo builds fail with `dlltool.exe: program not found`.
> `npm run tauri:dev` and `npm run tauri:build` handle this automatically: they
> go through `scripts/run-tauri.mjs`, which prefers the rustup MSVC toolchain and
> loads the Visual Studio build environment before invoking the CLI.
>
> If you need to run `cargo` yourself, dot-source the bundled helper first:
>
> ```powershell
> . .\scripts\dev-shell.ps1
> cargo build
> ```

### Enabling Microsoft sign-in

Microsoft sign-in ships with a built-in Azure "public client" application id, so
offline profiles work immediately and online sign-in works out of the box.

Minecraft authentication has hard requirements, because it relies on the
`XboxLive.signin` scope:

- The Azure app must allow **personal Microsoft accounts** — work/school (Entra)
  accounts cannot hold a Minecraft Java license for this flow.
- The code signs in via the **`consumers`** authority
  (`src-tauri/src/core/auth/microsoft.rs`, `TENANT`). Requesting
  `XboxLive.signin` against a tenant id or `common` fails with
  `AADSTS650053`.
- Users sign in with the personal Microsoft account that owns Minecraft.

The built-in Microsoft client id is compiled into the binary, so it is not
configurable through the UI. It is not a secret (public clients have no client
secret; the id travels in OAuth requests), but removing user-editability
prevents accidental misconfiguration. Fork maintainers can override it at build
time with `AETHER_MS_CLIENT_ID=<id> cargo build` (the value is read via
`option_env!` and cannot be changed at runtime).

Aether's own registration is allow-listed by Mojang, so the device-code flow
above works as-is. A "Sign-in not working? Use browser sign-in" fallback is still
there, borrowing Microsoft's own Minecraft client id — the one the official
launcher uses. That flow finishes on Microsoft's page, so you copy the address
bar into Aether; the code is exchanged locally with `login.live.com`. Accounts
created this way are flagged (`Account::legacy_auth`) and refreshed through the
same endpoint.

To use your own Entra registration instead:

1. In [Microsoft Entra ID](https://entra.microsoft.com) register a new app.
2. Under **Authentication** → **Supported account types**, choose
   **Personal Microsoft accounts only**.
3. On the same page, enable **Allow public client flows** (required for the
   device-code flow — no client secret is used).
4. Rebuild from source with your id: `AETHER_MS_CLIENT_ID=<your-client-id> cargo build`
   (set it for the `tauri build`/`npm tauri build` step).
5. New app registrations must be allow-listed by Mojang before
   `api.minecraftservices.com` will accept them — Aether's own id already is.
   Until yours is, the final login step returns `Invalid app registration`
   (HTTP 403). Request access at <https://aka.ms/mce-reviewappid>.

Offline profiles always work, regardless of the above.

#### Browser sign-in fallback

The sign-in dialog offers a second path under **"Sign-in not working? Use browser
sign-in"**, for anyone a device-code sign-in doesn't suit. It signs in through
Microsoft's own Minecraft client id — the one the official launcher uses, which is
already allow-listed — via the legacy `login.live.com` flow.

That client id is not an Entra application, so the device-code flow is not
available for it at all. Instead the browser finishes on a Microsoft-owned page
and you copy the address bar back into Aether, which exchanges the one-time code
directly with Microsoft. The code never leaves your machine, and the exchange
happens in the same local backend that performs every other request.

Accounts created this way are flagged internally (`Account::legacy_auth`) so that
token refreshes go back to `login.live.com` rather than the identity platform.

---

## Development

Prettier and ESLint are configured:

```bash
npm run format
npm run lint
```

The Rust side is a normal Cargo project:

```bash
cd src-tauri
cargo check
cargo test
cargo clippy
```

---

## Roadmap

- [x] Tauri + React + Rust project scaffold
- [x] Full launcher core (versions, libraries, assets, natives, launching)
- [x] Instance CRUD, loaders, per-instance settings
- [x] Modrinth search, install, dependency resolution and updates
- [x] `.mrpack` import/export
- [x] Offline accounts
- [x] Microsoft device-code authentication
- [x] Skin changer / viewer
- [x] Server list management
- [x] Screenshots and world backups
- [x] Import from other launchers (Prism, MultiMC, CurseForge, vanilla, Modrinth App)
- [x] CurseForge search, install, dependency resolution and modpacks
- [ ] Multiple simultaneous game processes (currently one per instance)
- [x] Auto-updating launcher (signed, in-app)

---

## License

[MIT](LICENSE) © Aether Contributors.

Aether is not affiliated with Mojang, Microsoft or Modrinth.
