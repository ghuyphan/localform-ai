# Native Companion Host

Chrome extensions cannot directly execute local programs. LocalForm uses Chrome Native Messaging so the extension can ask a small local host process to start Ollama.

## Install

1. Load `extension/` in Chrome.
2. Copy the extension ID from `chrome://extensions`.
3. Run:

```bash
python3 native_host/install_native_host.py --extension-id YOUR_EXTENSION_ID
```

On Windows use:

```powershell
python native_host\install_native_host.py --extension-id YOUR_EXTENSION_ID
```

Restart Chrome after installing.

## What it does

The host supports these commands:

- `status`: checks host version, Ollama path, and Ollama API status.
- `ensure_ollama`: checks `/api/tags`; if offline, runs `ollama serve` and waits until ready.
- `start_ollama`: starts `ollama serve` without waiting for form generation.

## Security notes

- The native messaging manifest binds the host to one extension ID.
- The extension only auto-starts localhost endpoints.
- The native host receives no Google Form content.
- Logs are written to `~/.localform-ai/ollama.log`.

## Uninstall

```bash
python3 native_host/uninstall_native_host.py
```
