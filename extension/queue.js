const els = {
  optionsBtn: document.querySelector("#optionsBtn"),
  linkInput: document.querySelector("#linkInput"),
  autoSubmit: document.querySelector("#autoSubmit"),
  clearDoneBtn: document.querySelector("#clearDoneBtn"),
  addBtn: document.querySelector("#addBtn"),
  runBtn: document.querySelector("#runBtn"),
  inputHint: document.querySelector("#inputHint"),
  summary: document.querySelector("#summary"),
  emptyState: document.querySelector("#emptyState"),
  list: document.querySelector("#list"),
  itemTemplate: document.querySelector("#itemTemplate")
};

const queue = [];
const STORAGE_KEY = "formQueue";
let running = false;
let saveTimer = null;

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.hostname === "docs.google.com" && url.pathname.includes("/forms/") ? url.href : "";
  } catch (_) {
    return "";
  }
}

function parseLinks(text) {
  return [...new Set(String(text || "")
    .split(/\s+/)
    .map(normalizeUrl)
    .filter(Boolean))];
}

function queueUrl(url) {
  const parsed = new URL(url);
  parsed.hash = "localform-queue";
  return parsed.href;
}

function setStatus(item, status, detail = "") {
  item.status = status;
  item.detail = detail;
  saveQueueSoon();
  render();
}

function statusLabel(status) {
  return {
    queued: "Queued",
    opening: "Opening",
    running: "Running",
    ready: "Ready",
    review: "Review",
    submitted: "Submitted",
    error: "Error"
  }[status] || status;
}

function isReady(item) {
  return item.results?.length && item.results.every((result) => result.status === "filled");
}

function isRunning(item) {
  return ["opening", "running"].includes(item.status);
}

function reviewResults(item) {
  return (item.results || []).filter((result) => result.status !== "filled");
}

function resultStats(item) {
  const results = item.results || [];
  const count = (status) => results.filter((result) => result.status === status).length;
  if (!results.length) return item.detail || "";
  return `${count("filled")} filled · ${count("review")} review · ${count("skipped")} skipped · ${count("failed")} failed`;
}

function itemDetail(item) {
  if (item.status === "error") return item.detail || "Something failed";
  if (item.status === "submitted") return "Submitted";
  if (item.status === "ready") return "Ready";
  if (item.status === "review") return "Needs answers";
  return item.detail || "";
}

function answerFor(item, questionId) {
  return (item.result?.answers || []).find((answer) => answer.questionId === questionId);
}

function questionFor(item, questionId) {
  return (item.form?.questions || []).find((question) => question.id === questionId);
}

function renderUnknowns(item, container) {
  container.innerHTML = "";
  for (const result of reviewResults(item)) {
    const question = questionFor(item, result.questionId);
    const answer = answerFor(item, result.questionId);
    if (!question) continue;

    const row = document.createElement("label");
    row.className = "unknown";
    row.innerHTML = `<span><b></b><small></small></span><input type="text" />`;
    row.querySelector("b").textContent = question.question;
    row.querySelector("small").textContent = `${result.status}${answer?.reason ? ` · ${answer.reason}` : ""}`;
    const input = row.querySelector("input");
    input.dataset.questionId = result.questionId;
    input.placeholder = answer?.reason || result.status;
    input.value = Array.isArray(answer?.answer) ? answer.answer.join(", ") : answer?.answer || "";
    container.appendChild(row);
  }
}

function render() {
  const ready = queue.filter((item) => item.status === "ready").length;
  const review = queue.filter((item) => item.status === "review").length;
  const active = queue.filter(isRunning).length;
  const submitted = queue.filter((item) => item.status === "submitted").length;
  els.summary.innerHTML = `<span>${queue.length} total</span><span>${active} running</span><span>${ready} ready</span><span>${review} review</span><span>${submitted} done</span>`;
  els.emptyState.hidden = queue.length > 0;
  els.runBtn.disabled = running || !queue.some((item) => ["queued", "error"].includes(item.status));
  els.clearDoneBtn.disabled = running || !queue.some((item) => ["submitted", "ready"].includes(item.status));
  els.list.innerHTML = "";

  for (const item of queue) {
    const node = els.itemTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    node.classList.toggle("is-busy", isRunning(item));
    node.querySelector(".title").textContent = item.form?.title || "Google Form";
    const link = node.querySelector(".url");
    link.href = item.url;
    link.textContent = item.url;
    const badge = node.querySelector(".badge");
    badge.textContent = statusLabel(item.status);
    badge.className = `badge ${item.status}`;
    node.querySelector(".stats").textContent = resultStats(item);
    const detail = itemDetail(item);
    if (detail) {
      const detailEl = document.createElement("div");
      detailEl.className = item.status === "error" ? "detail" : "stats";
      detailEl.textContent = detail;
      node.querySelector(".stats").after(detailEl);
    }
    renderUnknowns(item, node.querySelector(".unknowns"));
    node.querySelector(".apply").hidden = !reviewResults(item).length || item.status !== "review";
    node.querySelector(".submit").disabled = item.status !== "ready";
    node.querySelector(".retry").hidden = !["error", "review"].includes(item.status);
    node.querySelector(".close-tab").hidden = !item.tabId;
    node.querySelector(".open").addEventListener("click", () => openItem(item));
    node.querySelector(".retry").addEventListener("click", () => processItem(item));
    node.querySelector(".apply").addEventListener("click", () => applyManualAnswers(item, node));
    node.querySelector(".submit").addEventListener("click", () => submitItem(item));
    node.querySelector(".close-tab").addEventListener("click", () => closeItemTab(item));
    node.querySelector(".remove").addEventListener("click", () => removeItem(item));
    els.list.appendChild(node);
  }
}

function addLinks() {
  const existing = new Set(queue.map((item) => item.url));
  const raw = String(els.linkInput.value || "").split(/\s+/).filter(Boolean);
  const parsed = parseLinks(els.linkInput.value);
  let added = 0;
  let duplicate = 0;
  for (const url of parsed) {
    if (existing.has(url)) {
      duplicate += 1;
      continue;
    }
    queue.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      url,
      status: "queued",
      tabId: null,
      form: null,
      result: null,
      results: []
    });
    existing.add(url);
    added += 1;
  }
  const invalid = raw.length - parsed.length;
  els.inputHint.textContent = added
    ? `${added} added${duplicate ? ` / ${duplicate} dup` : ""}${invalid ? ` / ${invalid} invalid` : ""}`
    : duplicate || invalid
      ? `${duplicate ? `${duplicate} dup` : ""}${duplicate && invalid ? " / " : ""}${invalid ? `${invalid} invalid` : ""}`
      : "0 links";
  els.linkInput.value = "";
  saveQueueSoon();
  render();
}

function serializableItem(item) {
  return {
    ...item,
    tabId: null
  };
}

function saveQueueSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({ [STORAGE_KEY]: queue.map(serializableItem) });
  }, 150);
}

async function loadQueue() {
  const data = await chrome.storage.local.get([STORAGE_KEY]);
  queue.splice(0, queue.length, ...((data[STORAGE_KEY] || []).map((item) => ({ ...item, tabId: null }))));
  render();
}

async function waitForTab(tabId) {
  const current = await chrome.tabs.get(tabId);
  if (current.status === "complete") return current;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Form tab timed out"));
    }, 45000);

    function listener(updatedTabId, info, tab) {
      if (updatedTabId !== tabId || info.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab);
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function sendTab(tabId, message) {
  let lastError = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      if (!response?.ok) throw new Error(response?.error || "Tab command failed");
      return response;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw lastError || new Error("Tab command failed");
}

async function openItem(item) {
  if (item.tabId) {
    try {
      await chrome.tabs.update(item.tabId, { active: true });
      return;
    } catch (_) {
      item.tabId = null;
    }
  }
  const tab = await chrome.tabs.create({ url: queueUrl(item.url), active: false });
  item.tabId = tab.id;
  saveQueueSoon();
  render();
}

async function processItem(item) {
  try {
    setStatus(item, "opening");
    if (item.tabId) {
      try {
        await chrome.tabs.remove(item.tabId);
      } catch (_) {
        // Tab is already gone.
      }
    }
    const tab = await chrome.tabs.create({ url: queueUrl(item.url), active: false });
    item.tabId = tab.id;
    await waitForTab(tab.id);

    setStatus(item, "running", "Scanning");
    const scanned = await sendTab(tab.id, { type: "SCAN_FORM" });
    item.form = scanned.form;
    if (!item.form?.questions?.length) throw new Error("No fillable fields found");

    setStatus(item, "running", "Drafting");
    const gen = await chrome.runtime.sendMessage({ type: "GENERATE_ANSWERS", form: item.form });
    if (!gen?.ok) throw new Error(gen?.error || "Draft failed");
    item.result = gen.result;

    const settingsResp = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    setStatus(item, "running", "Filling");
    const filled = await sendTab(tab.id, {
      type: "FILL_FORM",
      payload: {
        ...item.result,
        settings: {
          confidenceThreshold: settingsResp.settings.confidenceThreshold,
          autoFillLowConfidence: settingsResp.settings.autoFillLowConfidence
        }
      }
    });
    item.results = filled.results || [];
    setStatus(item, isReady(item) ? "ready" : "review");

    if (els.autoSubmit.checked && isReady(item)) {
      await submitItem(item);
    }
  } catch (error) {
    setStatus(item, "error", error.message || String(error));
  }
}

function coerceManualValue(question, value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (question.type === "checkbox") {
    return text.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return text;
}

async function applyManualAnswers(item, node) {
  const manual = [...node.querySelectorAll(".unknown input")]
    .map((input) => {
      const question = questionFor(item, input.dataset.questionId);
      return question ? {
        questionId: question.id,
        answer: coerceManualValue(question, input.value),
        confidence: 1,
        needsReview: false,
        reason: "manual"
      } : null;
    })
    .filter((answer) => answer && answer.answer != null);

  if (!manual.length) return;

  const existing = new Map((item.result?.answers || []).map((answer) => [answer.questionId, answer]));
  for (const answer of manual) existing.set(answer.questionId, answer);
  item.result = {
    ...(item.result || {}),
    answers: [...existing.values()]
  };

  if (!item.tabId) await openItem(item);
  const filled = await sendTab(item.tabId, { type: "FILL_FORM", payload: item.result });
  item.results = filled.results || [];
  setStatus(item, isReady(item) ? "ready" : "review");
}

async function submitItem(item) {
  if (!isReady(item)) return;
  if (!els.autoSubmit.checked && !confirm("Submit this ready form?")) return;
  try {
    await sendTab(item.tabId, { type: "SUBMIT_FORM" });
    setStatus(item, "submitted");
  } catch (error) {
    setStatus(item, "error", error.message || String(error));
  }
}

async function closeItemTab(item) {
  if (!item.tabId) return;
  try {
    await chrome.tabs.remove(item.tabId);
  } catch (_) {
    // Tab is already closed.
  }
  item.tabId = null;
  saveQueueSoon();
  render();
}

async function removeItem(item) {
  await closeItemTab(item);
  const index = queue.findIndex((queued) => queued.id === item.id);
  if (index !== -1) queue.splice(index, 1);
  saveQueueSoon();
  render();
}

function clearDone() {
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if (["submitted", "ready"].includes(queue[i].status)) queue.splice(i, 1);
  }
  saveQueueSoon();
  render();
}

async function runQueue() {
  if (running) return;
  if (!queue.some((item) => ["queued", "error"].includes(item.status))) return;
  if (els.autoSubmit.checked && !confirm("Auto-submit every ready form in this queue?")) return;
  running = true;
  document.body.classList.add("is-running");
  els.runBtn.disabled = true;
  els.addBtn.disabled = true;

  try {
    for (const item of queue) {
      if (item.status === "queued" || item.status === "error") {
        await processItem(item);
      }
    }
  } finally {
    running = false;
    document.body.classList.remove("is-running");
    els.runBtn.disabled = false;
    els.addBtn.disabled = false;
    render();
  }
}

els.optionsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
els.clearDoneBtn.addEventListener("click", clearDone);
els.addBtn.addEventListener("click", addLinks);
els.runBtn.addEventListener("click", () => {
  addLinks();
  runQueue();
});
els.linkInput.addEventListener("input", () => {
  const count = parseLinks(els.linkInput.value).length;
  els.inputHint.textContent = `${count} link${count === 1 ? "" : "s"}`;
});

loadQueue();
