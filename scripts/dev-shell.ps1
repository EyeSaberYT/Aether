# Aether - Windows developer shell helper.
#
# Dot-source this before running Cargo on Windows:
#
#     . .\scripts\dev-shell.ps1
#     cargo check
#
# Why it exists: this machine has a standalone GNU Rust (via Chocolatey) on
# PATH which shadows rustup's MSVC toolchain. GNU Rust needs `dlltool.exe` /
# `gcc` to link and fails without them. Preferring the rustup MSVC toolchain and
# loading the Visual Studio build environment fixes both the toolchain mix-up
# and the missing `link.exe` / `cl.exe`.

# Note: this script deliberately leaves $ErrorActionPreference untouched so that
# Cargo's normal stderr output is not treated as a terminating error.

# 1. Prefer rustup's MSVC toolchain over any standalone rust on PATH.
$architecture = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "aarch64-pc-windows-msvc" } else { "x86_64-pc-windows-msvc" }
$msvcBin = Join-Path $env:USERPROFILE ".rustup\toolchains\stable-$architecture\bin"
if (Test-Path $msvcBin) {
    $env:PATH = "$msvcBin;$env:PATH"
}

# 2. Load the Visual Studio developer environment so cc/link are available.
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $vsInstall = & $vswhere -latest -products * -property installationPath 2>$null
    if ($vsInstall) {
        $devCmd = Join-Path $vsInstall "Common7\Tools\VsDevCmd.bat"
        if (Test-Path $devCmd) {
            cmd /c "`"$devCmd`" -arch=amd64 -host_arch=amd64 >nul && set" | ForEach-Object {
                if ($_ -match "^(.*?)=(.*)$") {
                    Set-Item -Path "env:$($matches[1])" -Value $matches[2]
                }
            }
        }
    }
}

$rustInfo = (rustc -vV 2>$null | Select-String "^host:").ToString().Trim()
Write-Host "Aether dev shell ready - $rustInfo" -ForegroundColor Green
