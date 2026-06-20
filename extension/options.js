const profileInputs = [...document.querySelectorAll("[data-profile]")];
const contextsEl = document.querySelector("#contexts");
const toast = document.querySelector("#toast");
const saveBtn = document.querySelector("#saveBtn");
const addContextBtn = document.querySelector("#addContext");

const fields = {
  endpoint: document.querySelector("#endpoint"),
  model: document.querySelector("#model"),
  temperature: document.querySelector("#temperature"),
  confidenceThreshold: document.querySelector("#confidenceThreshold"),
  magicMode: document.querySelector("#magicMode"),
  magicDelayMs: document.querySelector("#magicDelayMs"),
  autoFillLowConfidence: document.querySelector("#autoFillLowConfidence"),
  autoStartOllama: document.querySelector("#autoStartOllama"),
  nativeHostName: document.querySelector("#nativeHostName"),
  launchTimeoutMs: document.querySelector("#launchTimeoutMs")
};

let settings = null;

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function showToast(text = "Saved") {
  toast.textContent = text;
  toast.hidden = false;
  setTimeout(() => (toast.hidden = true), 1400);
}

function renderContexts() {
  contextsEl.innerHTML = "";
  for (const context of settings.contexts || []) {
    const item = document.createElement("div");
    item.className = "context-item";
    item.dataset.id = context.id;
    item.innerHTML = `
      <div class="context-top">
        <input type="text" class="context-title" placeholder="Context name" />
        <input type="checkbox" class="context-enabled" title="Enabled" />
        <button type="button" class="context-delete">Delete</button>
      </div>
      <textarea class="context-body" rows="5" placeholder="Example: Nếu form hỏi chiến dịch beauty, ưu tiên trả lời giọng creator thân thiện..."></textarea>
    `;
    item.querySelector(".context-title").value = context.title || "";
    item.querySelector(".context-enabled").checked = Boolean(context.enabled);
    item.querySelector(".context-body").value = context.body || "";
    item.querySelector(".context-delete").addEventListener("click", () => {
      settings.contexts = settings.contexts.filter((x) => x.id !== context.id);
      renderContexts();
    });
    contextsEl.appendChild(item);
  }
}

function loadToForm() {
  for (const input of profileInputs) {
    input.value = settings.profile?.[input.dataset.profile] || "";
  }

  fields.endpoint.value = settings.endpoint || "http://localhost:11434";
  fields.model.value = settings.model || "qwen2.5:7b";
  fields.temperature.value = settings.temperature ?? 0.2;
  fields.confidenceThreshold.value = settings.confidenceThreshold ?? 0.72;
  fields.magicMode.checked = Boolean(settings.magicMode);
  fields.magicDelayMs.value = settings.magicDelayMs ?? 1200;
  fields.autoFillLowConfidence.checked = Boolean(settings.autoFillLowConfidence);
  fields.autoStartOllama.checked = Boolean(settings.autoStartOllama);
  fields.nativeHostName.value = settings.nativeHostName || "ai.localform.host";
  fields.launchTimeoutMs.value = settings.launchTimeoutMs ?? 22000;

  renderContexts();
}

function collect() {
  const profile = {};
  for (const input of profileInputs) {
    profile[input.dataset.profile] = input.value.trim();
  }

  const contexts = [...contextsEl.querySelectorAll(".context-item")].map((item) => ({
    id: item.dataset.id,
    title: item.querySelector(".context-title").value.trim() || "Untitled context",
    enabled: item.querySelector(".context-enabled").checked,
    body: item.querySelector(".context-body").value.trim()
  }));

  return {
    endpoint: fields.endpoint.value.trim() || "http://localhost:11434",
    model: fields.model.value.trim() || "qwen2.5:7b",
    temperature: Number(fields.temperature.value || 0.2),
    confidenceThreshold: Number(fields.confidenceThreshold.value || 0.72),
    magicMode: fields.magicMode.checked,
    magicDelayMs: Number(fields.magicDelayMs.value || 1200),
    autoFillLowConfidence: fields.autoFillLowConfidence.checked,
    autoStartOllama: fields.autoStartOllama.checked,
    nativeHostName: fields.nativeHostName.value.trim() || "ai.localform.host",
    launchTimeoutMs: Number(fields.launchTimeoutMs.value || 22000),
    profile,
    contexts
  };
}

async function save() {
  settings = collect();
  const resp = await send({ type: "SAVE_SETTINGS", settings });
  if (!resp.ok) throw new Error(resp.error);
  settings = resp.settings;
  showToast("Saved locally");
}

addContextBtn.addEventListener("click", () => {
  settings.contexts = settings.contexts || [];
  settings.contexts.push({
    id: uuid(),
    title: "New context",
    enabled: true,
    body: ""
  });
  renderContexts();
});

saveBtn.addEventListener("click", () => {
  save().catch((error) => showToast(error.message || "Save failed"));
});

(async function init() {
  const resp = await send({ type: "GET_SETTINGS" });
  settings = resp.settings;
  loadToForm();
})();
