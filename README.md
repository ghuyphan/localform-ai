# LocalForm AI

LocalForm AI is a private Chrome extension for drafting and filling Google Forms with a local Ollama model. It is built around creator campaign forms: KOC/KOL profile details, channel metrics, rate cards, shipping info, livestream commitments, and campaign-specific context.

The extension keeps the boring fields deterministic and lets the model help with the fuzzy ones. It will not send form content to a cloud API by default.

## Highlights

- Local Ollama chat for form answers
- Google Forms scanner and filler
- Profile-backed answers for names, links, phone, email, rates, GMV, followers, address, freecast, MCN status, and livestream details
- Magic Mode for automatic draft/fill when a form opens
- Queue Mode for processing multiple form links
- Native companion host that can start Ollama and proxy local requests when Chrome origin rules get in the way
- Review-first behavior for skipped, low-confidence, unsupported, or risky fields

## Project Layout

```txt
extension/       Chrome extension UI, content script, background worker
native_host/     Optional native messaging companion for Ollama
docs/            Architecture and native-host notes
scripts/         Regression and real-Ollama eval tests
```

## Install

1. Install Ollama.

   ```bash
   ollama pull qwen3.5:4b
   ```

2. Load the extension.

   Open `chrome://extensions`, enable Developer Mode, choose **Load unpacked**, and select `extension/`.

3. Install the native companion.

   Copy the extension ID from Chrome, then run:

   ```bash
   python3 native_host/install_native_host.py --extension-id YOUR_EXTENSION_ID
   ```

4. Restart Chrome.

5. Open the extension settings and fill your reusable profile facts.

## Usage

### Magic Mode

Open a Google Form. LocalForm scans it, drafts answers locally, fills safe fields, and marks anything that needs review.

### Popup Mode

Open a Google Form, click the extension icon, then use **Scan** and **Fill**.

### Queue Mode

Click **Queue** in the popup, paste Google Form links, then run the queue. Each form opens in an inactive tab, gets drafted and filled, and ends in one of these states:

- `Ready`: every scanned field filled successfully
- `Review`: one or more fields need your answer
- `Submitted`: submitted from the queue
- `Error`: login, closed form, unsupported page, or another failure

Queue Mode can submit ready forms, but it only does that after the form has no skipped, review, or failed fields.

## Profile Fields

LocalForm works best when these are filled:

- TikTok handle and URL
- Facebook and YouTube URLs
- follower count, GMV, sold count
- Zalo phone and email
- recipient name and shipping address
- product preference
- content niche and video style
- TikTok, Facebook, and YouTube rates
- deliverables, freecast, livestream cadence, hours per live, posting deadline
- MCN or agency status

## Safety Boundaries

LocalForm intentionally treats some fields as hard facts instead of model guesses:

- rates must come from the rate card or become `0` for saved freecast campaigns
- phone or receiver number fields use the saved Zalo phone
- product sample fields cannot become profile links
- sold-count, GMV, follower, and rate fields must be digits
- names and addresses are kept separate
- file upload, CAPTCHA, login bypass, and closed forms are not automated

## Tests

Fast rule tests:

```bash
npm test
```

Real local-model eval:

```bash
OLLAMA_ENDPOINT=http://127.0.0.1:11434 OLLAMA_MODEL=qwen3.5:4b npm run test:ai
```

The real eval calls Ollama, runs a campaign-style fake form through the same generation path the extension uses, then asserts that the repaired final answers are safe.

## Development Notes

If Ollama rejects Chrome extension requests with a 403, reinstall the native host and restart Chrome:

```bash
python3 native_host/install_native_host.py --extension-id YOUR_EXTENSION_ID
```

For manual development without the companion, quit any existing Ollama app process and start:

```bash
OLLAMA_ORIGINS=chrome-extension://* ollama serve
```

## Privacy

- Form content is scanned in the active browser tab.
- Draft prompts go to local Ollama.
- Profile data is stored in `chrome.storage.local`.
- The native companion only handles health/start/proxy requests for local Ollama.
- No cloud model API is used by default.
