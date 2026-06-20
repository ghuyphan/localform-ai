const els = {
  openOptions: document.querySelector("#openOptions"),
  queueBtn: document.querySelector("#queueBtn"),
  scanBtn: document.querySelector("#scanBtn"),
  fillBtn: document.querySelector("#fillBtn"),
  startOllamaBtn: document.querySelector("#startOllamaBtn"),
  statusDot: document.querySelector("#statusDot"),
  statusTitle: document.querySelector("#statusTitle"),
  statusText: document.querySelector("#statusText"),
  resultBox: document.querySelector("#resultBox"),
  formTitle: document.querySelector("#formTitle"),
  questionCount: document.querySelector("#questionCount"),
  answerList: document.querySelector("#answerList")
};

let lastForm = null;
let lastResult = null;
let cachedSettings = null;

function setBusy(isBusy) {
  els.queueBtn.disabled = isBusy;
  els.scanBtn.disabled = isBusy;
  els.fillBtn.disabled = isBusy;
  els.startOllamaBtn.disabled = isBusy;
}

function setStatus(kind, title, text, { showStart = false } = {}) {
  els.statusDot.className = `status-dot ${kind || ""}`.trim();
  els.statusTitle.textContent = title;
  els.statusText.textContent = text;
  els.startOllamaBtn.hidden = !showStart;
}

function sendRuntime(message) {
  return chrome.runtime.sendMessage(message);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  return tab;
}

async function sendTab(message) {
  const tab = await getActiveTab();
  if (tab.url?.startsWith(chrome.runtime.getURL(""))) {
    throw new Error("Use Queue for batch forms, or open a Google Form tab first");
  }
  if (!tab.url?.includes("docs.google.com/forms/")) {
    throw new Error("Open a Google Form first");
  }
  return chrome.tabs.sendMessage(tab.id, message);
}

function renderForm(form, result) {
  els.resultBox.hidden = false;
  els.formTitle.textContent = form?.title || "Google Form";
  els.questionCount.textContent = `${form?.questions?.length || 0} fields`;

  const answersById = new Map((result?.answers || []).map((answer) => [answer.questionId, answer]));
  els.answerList.innerHTML = "";

  for (const q of form?.questions || []) {
    const answer = answersById.get(q.id);
    const row = document.createElement("div");
    row.className = "answer-row";
    row.innerHTML = `<strong></strong><span></span>`;
    row.querySelector("strong").textContent = q.question;
    row.querySelector("span").textContent = answer
      ? `${answer.needsReview ? "Review" : "Ready"} · ${Array.isArray(answer.answer) ? answer.answer.join(", ") : answer.answer ?? "—"}`
      : `${q.type} · ${q.required ? "required" : "optional"}`;
    els.answerList.appendChild(row);
  }
}

function describeOllamaResult(resp) {
  const result = resp?.result || {};
  const models = result?.result?.models?.length ?? result?.models?.length ?? 0;
  const started = result?.started ? "started" : "ready";
  return `${cachedSettings?.model || "model"} · ${started}${models ? ` · ${models} models` : ""}`;
}

async function ping({ forceStart = false } = {}) {
  const settingsResp = await sendRuntime({ type: "GET_SETTINGS" });
  cachedSettings = settingsResp.settings;

  try {
    const resp = await sendRuntime({ type: "PING_OLLAMA", forceStart });
    if (!resp.ok) throw new Error(resp.error);
    setStatus("ok", "Ollama ready", describeOllamaResult(resp));
  } catch (error) {
    const msg = error.message || "Start Ollama first";
    const canStart = /native|host|not found|unavailable|Ollama|Failed to fetch|responded|connect/i.test(msg);
    setStatus("bad", "Ollama offline", msg, { showStart: canStart });
  }
}

async function startOllama() {
  setBusy(true);
  setStatus("", "Starting Ollama", "using local companion…");
  try {
    const resp = await sendRuntime({ type: "START_OLLAMA" });
    if (!resp.ok) throw new Error(resp.error);
    setStatus("ok", "Ollama ready", describeOllamaResult(resp));
  } catch (error) {
    setStatus("bad", "Start failed", error.message || String(error), { showStart: true });
  } finally {
    setBusy(false);
  }
}

async function scan() {
  setBusy(true);
  try {
    const resp = await sendTab({ type: "SCAN_FORM" });
    if (!resp.ok) throw new Error(resp.error);
    lastForm = resp.form;
    renderForm(lastForm, null);
    setStatus("ok", "Form scanned", `${lastForm.questions.length} fields found`);
    return lastForm;
  } catch (error) {
    setStatus("bad", "Scan failed", error.message || String(error));
    throw error;
  } finally {
    setBusy(false);
  }
}

async function fill() {
  setBusy(true);
  try {
    const form = lastForm || (await scan());
    setStatus("", "Thinking locally", cachedSettings?.model || "Ollama");

    const gen = await sendRuntime({ type: "GENERATE_ANSWERS", form });
    if (!gen.ok) throw new Error(gen.error);
    lastResult = gen.result;
    renderForm(form, lastResult);

    const settingsResp = await sendRuntime({ type: "GET_SETTINGS" });
    const fillResp = await sendTab({
      type: "FILL_FORM",
      payload: {
        ...lastResult,
        settings: {
          confidenceThreshold: settingsResp.settings.confidenceThreshold,
          autoFillLowConfidence: settingsResp.settings.autoFillLowConfidence
        }
      }
    });
    if (!fillResp.ok) throw new Error(fillResp.error);

    const filled = fillResp.results.filter((r) => r.status === "filled").length;
    const review = fillResp.results.filter((r) => r.status === "review").length;
    setStatus("ok", "Draft filled", `${filled} filled · ${review} review`);
  } catch (error) {
    setStatus("bad", "Fill failed", error.message || String(error), { showStart: /Ollama|native|host|fetch/i.test(error.message || "") });
  } finally {
    setBusy(false);
  }
}

els.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
els.queueBtn.addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("queue.html") }));
els.scanBtn.addEventListener("click", () => scan().catch(() => undefined));
els.fillBtn.addEventListener("click", () => fill().catch(() => undefined));
els.startOllamaBtn.addEventListener("click", () => startOllama().catch(() => undefined));

ping();
