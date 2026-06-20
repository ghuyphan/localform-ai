# Architecture

```txt
Google Form tab
  ↓ content script scans DOM
Auto-draft, optional
  ↓ starts draft flow when form opens
Popup
  ↓ asks background to generate answers
Background service worker, Manifest V3
  ↓ ensures Ollama is running
Native companion host, optional
  ↓ starts `ollama serve` if needed
Ollama localhost API
  ↓ strict JSON answers
Background
  ↓ returns validated answers
Content script
  ↓ fills supported fields and marks review chips
User reviews and submits manually
```

## Extension parts

### content.js

Responsible for the page.

- Detects form title and questions.
- Detects field type.
- Extracts options for radio/checkbox/dropdown.
- Fills values using native input setters and click events.
- Adds review chips to fields.

### background.js

Responsible for local AI and native-host routing.

- Reads settings from `chrome.storage.local`.
- Calls Ollama `/api/tags` for health check.
- If offline and auto-start is enabled, calls the native companion.
- Calls Ollama `/api/chat` with `format: "json"`.
- Validates that returned answer IDs match scanned question IDs.

### popup.js

Responsible for the small UI.

- Draft current form.
- Open Queue.
- Ollama status.
- Start Ollama fallback button.
- Compact answer preview.

### options.js

Responsible for profile and context.

- Creator identity.
- Channel links.
- Metrics.
- Contact details.
- Campaign-specific custom context.
- Local model settings.
- Auto-start toggle.

### native_host/localform_native_host.py

Optional native messaging host.

- Checks whether `http://127.0.0.1:11434/api/tags` is ready.
- Finds the `ollama` CLI.
- Starts `ollama serve` as a detached local process.
- Writes Ollama output to `~/.localform-ai/ollama.log`.

It does not receive or store Google Form content.

## Why not submit automatically?

Submitting automatically can create accidental spam and incorrect personal commitments. The system is designed as a drafting assistant: fill fields, mark uncertainty, and let the user submit manually.
