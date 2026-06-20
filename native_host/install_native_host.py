#!/usr/bin/env python3
"""Install the LocalForm AI native messaging host for Chrome.

Usage:
  python3 native_host/install_native_host.py --extension-id <ID from chrome://extensions>

Why extension-id is required:
Chrome native messaging manifests cannot use wildcards in allowed_origins, so the
host must be explicitly bound to your installed LocalForm extension ID.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import stat
import sys
from pathlib import Path

HOST_NAME = "ai.localform.host"
DESCRIPTION = "LocalForm AI native companion for starting Ollama"
ROOT = Path(__file__).resolve().parents[1]
HOST_SCRIPT = ROOT / "native_host" / "localform_native_host.py"


def browser_manifest_dir(browser: str) -> Path:
    system = platform.system().lower()
    home = Path.home()
    browser = browser.lower()

    if system == "darwin":
        base = home / "Library" / "Application Support"
        if browser == "edge":
            return base / "Microsoft Edge" / "NativeMessagingHosts"
        if browser == "chromium":
            return base / "Chromium" / "NativeMessagingHosts"
        return base / "Google" / "Chrome" / "NativeMessagingHosts"

    if system == "linux":
        if browser == "edge":
            return home / ".config" / "microsoft-edge" / "NativeMessagingHosts"
        if browser == "chromium":
            return home / ".config" / "chromium" / "NativeMessagingHosts"
        return home / ".config" / "google-chrome" / "NativeMessagingHosts"

    if system == "windows":
        return ROOT / "native_host" / "generated"

    raise RuntimeError(f"Unsupported platform: {system}")


def create_wrapper() -> Path:
    system = platform.system().lower()
    if system == "windows":
        wrapper = ROOT / "native_host" / "localform_native_host.cmd"
        wrapper.write_text(f'@echo off\r\npython "{HOST_SCRIPT}"\r\n', encoding="utf-8")
        return wrapper

    wrapper = ROOT / "native_host" / "localform_native_host.sh"
    wrapper.write_text(
        "#!/usr/bin/env sh\n"
        "exec python3 \"$(dirname \"$0\")/localform_native_host.py\"\n",
        encoding="utf-8",
    )
    wrapper.chmod(wrapper.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return wrapper


def write_manifest(extension_id: str, browser: str) -> Path:
    if not HOST_SCRIPT.exists():
        raise FileNotFoundError(f"Missing host script: {HOST_SCRIPT}")

    target_dir = browser_manifest_dir(browser)
    target_dir.mkdir(parents=True, exist_ok=True)
    wrapper = create_wrapper()

    manifest = {
        "name": HOST_NAME,
        "description": DESCRIPTION,
        "path": str(wrapper.resolve()),
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{extension_id}/"],
    }

    manifest_path = target_dir / f"{HOST_NAME}.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest_path


def install_windows_registry(manifest_path: Path, browser: str) -> None:
    import winreg  # type: ignore

    if browser == "edge":
        key_path = f"Software\\Microsoft\\Edge\\NativeMessagingHosts\\{HOST_NAME}"
    else:
        key_path = f"Software\\Google\\Chrome\\NativeMessagingHosts\\{HOST_NAME}"

    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(manifest_path.resolve()))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--extension-id", required=True, help="LocalForm extension ID from chrome://extensions")
    parser.add_argument("--browser", choices=["chrome", "chromium", "edge"], default="chrome")
    args = parser.parse_args()

    extension_id = args.extension_id.strip()
    if len(extension_id) < 20 or not extension_id.isalnum():
        raise SystemExit("Extension ID looks invalid. Copy it from chrome://extensions.")

    manifest_path = write_manifest(extension_id, args.browser)

    if platform.system().lower() == "windows":
        install_windows_registry(manifest_path, args.browser)

    print("Installed LocalForm native host")
    print(f"Host name: {HOST_NAME}")
    print(f"Manifest: {manifest_path}")
    print("Restart Chrome, then open the LocalForm popup and press Start if needed.")


if __name__ == "__main__":
    main()
