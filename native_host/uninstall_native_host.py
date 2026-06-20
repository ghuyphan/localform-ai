#!/usr/bin/env python3
from __future__ import annotations

import argparse
import platform
from pathlib import Path

HOST_NAME = "ai.localform.host"
ROOT = Path(__file__).resolve().parents[1]


def manifest_dirs(browser: str):
    home = Path.home()
    system = platform.system().lower()
    if system == "darwin":
        base = home / "Library" / "Application Support"
        return [base / "Google" / "Chrome" / "NativeMessagingHosts", base / "Chromium" / "NativeMessagingHosts", base / "Microsoft Edge" / "NativeMessagingHosts"]
    if system == "linux":
        return [home / ".config" / "google-chrome" / "NativeMessagingHosts", home / ".config" / "chromium" / "NativeMessagingHosts", home / ".config" / "microsoft-edge" / "NativeMessagingHosts"]
    if system == "windows":
        return [ROOT / "native_host" / "generated"]
    return []


def uninstall_windows(browser: str):
    import winreg  # type: ignore
    paths = [
        f"Software\\Google\\Chrome\\NativeMessagingHosts\\{HOST_NAME}",
        f"Software\\Microsoft\\Edge\\NativeMessagingHosts\\{HOST_NAME}",
    ]
    for path in paths:
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, path)
            print(f"Removed registry key: HKCU\\{path}")
        except FileNotFoundError:
            pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser", choices=["chrome", "chromium", "edge", "all"], default="all")
    args = parser.parse_args()

    for d in manifest_dirs(args.browser):
        path = d / f"{HOST_NAME}.json"
        if path.exists():
            path.unlink()
            print(f"Removed {path}")

    if platform.system().lower() == "windows":
        uninstall_windows(args.browser)


if __name__ == "__main__":
    main()
