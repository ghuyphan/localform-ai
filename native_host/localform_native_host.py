#!/usr/bin/env python3
"""Native messaging host for LocalForm AI.

It receives tiny JSON messages from the Chrome extension and can start Ollama
locally. It can start Ollama locally and proxy local Ollama requests when the
browser extension is blocked by Ollama CORS/origin checks. Data stays on this machine.
"""
from __future__ import annotations

import json
import os
import platform
import shutil
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional

HOST_VERSION = "0.2.3"
DEFAULT_ENDPOINT = "http://127.0.0.1:11434"
LOG_DIR = Path.home() / ".localform-ai"
LOG_FILE = LOG_DIR / "ollama.log"


def merge_origins(current: str) -> str:
    """Allow browser extensions to call Ollama during development.

    Native proxy calls do not need this, but setting it helps when the
    extension also calls Ollama directly. Existing user values are preserved.
    """
    defaults = [
        "chrome-extension://*",
        "moz-extension://*",
        "safari-web-extension://*",
    ]
    parts = [part.strip() for part in str(current or "").split(",") if part.strip()]
    for origin in defaults:
        if origin not in parts:
            parts.append(origin)
    return ",".join(parts)


def post_json(endpoint: str, path: str, payload: Dict[str, Any], timeout: float = 120.0) -> Dict[str, Any]:
    url = endpoint.rstrip("/") + path
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8") or "{}"
        return json.loads(raw)


def read_message() -> Optional[Dict[str, Any]]:
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    if len(raw_length) < 4:
        raise RuntimeError("Invalid native message length header")
    message_length = struct.unpack("=I", raw_length)[0]
    body = sys.stdin.buffer.read(message_length)
    if len(body) < message_length:
        raise RuntimeError("Invalid native message body")
    return json.loads(body.decode("utf-8"))


def send_message(payload: Dict[str, Any]) -> None:
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def ping(endpoint: str = DEFAULT_ENDPOINT, timeout: float = 1.2) -> Dict[str, Any]:
    url = endpoint.rstrip("/") + "/api/tags"
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as response:
      data = json.loads(response.read().decode("utf-8") or "{}")
      return {"ok": True, "models": data.get("models", []), "endpoint": endpoint}


def ollama_path() -> Optional[str]:
    exe = shutil.which("ollama")
    if exe:
        return exe

    candidates = []
    system = platform.system().lower()
    if system == "darwin":
        candidates.extend([
            "/opt/homebrew/bin/ollama",
            "/usr/local/bin/ollama",
            "/Applications/Ollama.app/Contents/Resources/ollama",
        ])
    elif system == "windows":
        local_app = os.environ.get("LOCALAPPDATA", "")
        program_files = os.environ.get("ProgramFiles", "")
        candidates.extend([
            str(Path(local_app) / "Programs" / "Ollama" / "ollama.exe"),
            str(Path(local_app) / "Ollama" / "ollama.exe"),
            str(Path(program_files) / "Ollama" / "ollama.exe"),
        ])
    else:
        candidates.extend(["/usr/bin/ollama", "/usr/local/bin/ollama"])

    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return None


def start_ollama_process() -> Dict[str, Any]:
    exe = ollama_path()
    if not exe:
        return {
            "ok": False,
            "error": "Ollama CLI not found. Install Ollama or add `ollama` to PATH.",
        }

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log = open(LOG_FILE, "ab", buffering=0)
    env = os.environ.copy()
    env.setdefault("OLLAMA_HOST", "127.0.0.1:11434")
    env["OLLAMA_ORIGINS"] = merge_origins(env.get("OLLAMA_ORIGINS", ""))

    kwargs: Dict[str, Any] = {
        "stdout": log,
        "stderr": subprocess.STDOUT,
        "stdin": subprocess.DEVNULL,
        "cwd": str(Path.home()),
        "env": env,
    }

    system = platform.system().lower()
    if system == "windows":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS  # type: ignore[attr-defined]
    else:
        kwargs["start_new_session"] = True

    proc = subprocess.Popen([exe, "serve"], **kwargs)
    return {"ok": True, "started": True, "pid": proc.pid, "path": exe, "log": str(LOG_FILE)}


def ensure_ollama(endpoint: str, timeout_ms: int) -> Dict[str, Any]:
    endpoint = endpoint or DEFAULT_ENDPOINT
    try:
        ready = ping(endpoint, timeout=1.0)
        return {"ok": True, "ready": True, "started": False, **ready}
    except Exception:
        pass

    started = start_ollama_process()
    if not started.get("ok"):
        return started

    deadline = time.time() + max(3, timeout_ms / 1000)
    last_error = ""
    while time.time() < deadline:
        try:
            ready = ping(endpoint, timeout=1.0)
            return {"ok": True, "ready": True, "started": True, **started, **ready}
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            time.sleep(0.45)

    return {
        "ok": False,
        "error": f"Ollama was started but API did not become ready. Last error: {last_error}",
        **started,
    }


def handle(message: Dict[str, Any]) -> Dict[str, Any]:
    command = message.get("command")
    endpoint = str(message.get("endpoint") or DEFAULT_ENDPOINT).rstrip("/")
    timeout_ms = int(message.get("timeoutMs") or 22000)

    if command == "status":
        try:
            ready = ping(endpoint, timeout=1.0)
            return {
                "ok": True,
                "version": HOST_VERSION,
                "host": "ai.localform.host",
                "ollamaReady": True,
                "ollamaPath": ollama_path(),
                **ready,
            }
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": True,
                "version": HOST_VERSION,
                "host": "ai.localform.host",
                "ollamaReady": False,
                "ollamaPath": ollama_path(),
                "error": str(exc),
            }

    if command == "ensure_ollama":
        return ensure_ollama(endpoint, timeout_ms)

    if command == "ollama_chat":
        ready = ensure_ollama(endpoint, timeout_ms)
        if not ready.get("ok"):
            return ready
        body = message.get("body")
        if not isinstance(body, dict):
            return {"ok": False, "error": "Missing Ollama request body."}
        try:
            data = post_json(endpoint, "/api/chat", body, timeout=max(30.0, timeout_ms / 1000))
            return {"ok": True, "proxied": True, "data": data}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            return {"ok": False, "error": f"Ollama HTTP {exc.code}: {detail}"}

    if command == "start_ollama":
        return start_ollama_process()

    return {"ok": False, "error": f"Unknown command: {command}"}


def main() -> None:
    try:
        while True:
            message = read_message()
            if message is None:
                break
            try:
                send_message(handle(message))
            except Exception as exc:  # noqa: BLE001
                send_message({"ok": False, "error": str(exc)})
    except Exception as exc:  # noqa: BLE001
        send_message({"ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()
