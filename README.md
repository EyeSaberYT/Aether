# Aether

A modern, open-source, ad-free Minecraft launcher for Windows, macOS and Linux —
built as a Tauri 2 desktop app with a React + TypeScript front end and a Rust core.

Aether is inspired by the [Modrinth App](https://modrinth.com/app): a clean,
dark-mode-first interface, first-class mod-loader support and deep Modrinth
integration, with none of the telemetry, ads or bundled junk found in legacy
launchers.

> **Status:** early development (`0.1.0`). Instance management and launching work
> end to end; the Microsoft sign-in flow needs a client ID (see below). The code
> is production-oriented and fully typed, but expect rough edges.

---

## Features

### Accounts
- **Microsoft sign-in** using the OAuth 2.0 **device-code flow** — no client
  secret and no local callback server.
- **Offline profiles** for single-player and mod testing, clearly marked as such.
- Multiple accounts with one-click switching.

### Instances
- Create, rename, duplicate and delete instances.
- Choose any Minecraft version (releases, snapshots and old betas) plus a loader:
  **Vanilla, Fabric, Quilt, Forge or NeoForge**.
- Automatic loader installation (Fabric/Quilt via their profile JSON; Forge and
  NeoForge via their official installers).
- Per-instance **memory**, **JVM arguments**, **game arguments**, **Java runtime**,
  **game directory**, **window size**, **fullscreen** and **Quick Play**.
- Custom icons, groups, tags and notes.
- Import and export **`.mrpack`** modpacks.
- A crash/launch **log viewer**.

### Modrinth integration
- Search mods, modpacks, resource packs, shaders and datapacks.
- Filter by game version, loader and sort order; browse project pages with
  gallery, description, metadata and version history.
- One-click install with **automatic dependency resolution**.
- **Update checks** for installed projects, with one-click apply.
- Install modpacks straight into a new, correctly-configured instance.

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
- Background update checks on startup.
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
  api/modrinth.rs         Typed Labrinth (Modrinth API v2) client
  commands/               Thin Tauri command surface (the IPC boundary)
  state.rs                Shared `AppState`
  error.rs                One `AetherError` type, serialized as a string
```

**Data flow.** React calls a function in `src/lib/api.ts`, which invokes a Tauri
command. The command delegates to `core/`, which never depends on Tauri. Long
operations stream progress over the `download://progress` event; the Microsoft
device-code prompt arrives on `auth://device-code`.

**On-disk layout** — one dot-prefixed folder holding everything (e.g.
`%APPDATA%\.aether` on Windows), the way the Modrinth App keeps its data:

```
.aether/
  config.json          global settings
  accounts.json        cached accounts
  instances.json       instance index
  instances/<id>/
    instance.json      per-instance settings
    .minecraft/        the game directory
  meta/                cached Mojang metadata
  java/                launcher-managed runtimes
  cache/               downloads & asset cache
  logs/                launcher + game logs
```

Data written by earlier versions (`Aether/`) is moved into `.aether`
automatically on first start. Set `AETHER_DATA_DIR` to relocate everything.

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

To use your own app registration instead:

1. In [Microsoft Entra ID](https://entra.microsoft.com) register a new app.
2. Under **Authentication** → **Supported account types**, choose
   **Personal Microsoft accounts only**.
3. On the same page, enable **Allow public client flows** (required for the
   device-code flow — no client secret is used).
4. Copy the **Application (client) ID** into **Settings → Modrinth &
   authentication → Microsoft client ID** (or set the `AETHER_MS_CLIENT_ID`
   environment variable, or change `default_client_id()`).
5. New app registrations must be allow-listed by Mojang before
   `api.minecraftservices.com` will accept them; until then the final login step
   returns `Invalid app registration` (HTTP 403). Request access at
   <https://aka.ms/mce-reviewappid>.

Offline profiles always work, regardless of the above.

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
- [ ] Skin changer / viewer
- [ ] Server list management
- [ ] CurseForge support
- [ ] Multiple simultaneous game processes (currently one per instance)
- [ ] Auto-updating launcher

---

## License

[MIT](LICENSE) © Aether Contributors.

Aether is not affiliated with Mojang, Microsoft or Modrinth.
