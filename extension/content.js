const LF_STATE = {
  lastForm: null,
  lastAnswers: null,
  magicRunning: false,
  magicDoneForUrl: ""
};

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\*$/, "")
    .trim();
}

function textOf(el) {
  return cleanText(el?.innerText || el?.textContent || "");
}

function getTitle() {
  return cleanText(
    document.querySelector('div[role="heading"][aria-level="1"]')?.innerText ||
      document.querySelector("h1")?.innerText ||
      document.title.replace(" - Google Forms", "")
  );
}

function detectRequired(block) {
  const text = block.innerText || "";
  return /\*\s*(Your answer|Câu trả lời|$)/i.test(text) || block.querySelector('[aria-label*="Required"]');
}

function getQuestionText(block, index) {
  const heading = block.querySelector('[role="heading"]');
  const candidates = [
    heading,
    block.querySelector(".M7eMe"),
    block.querySelector(".HoXoMd"),
    block.querySelector(".geS5n"),
    block.querySelector(".z12JJ")
  ].filter(Boolean);

  for (const candidate of candidates) {
    const label = textOf(candidate);
    if (label && !/^Your answer$/i.test(label)) return label.replace(/\s+\*$/, "");
  }

  const lines = textOf(block)
    .split(/(?<=\?)\s+|\n+/)
    .map(cleanText)
    .filter(Boolean);

  return lines[0] || `Question ${index + 1}`;
}

function getDescription(block, questionText) {
  const full = textOf(block);
  if (!full || !questionText) return "";
  let desc = full.replace(questionText, "").trim();
  desc = desc.replace(/Your answer/g, "").replace(/Clear selection/g, "").trim();
  return desc.slice(0, 500);
}

function unique(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function getChoiceLabel(choice) {
  const aria = cleanText(choice.getAttribute("aria-label"));
  if (aria) return aria;
  const parent = choice.closest("label") || choice.parentElement;
  return textOf(parent).replace(/^Other:$/i, "Other");
}

function detectType(block) {
  if (block.querySelector('[role="checkbox"]')) return "checkbox";
  if (block.querySelector('[role="radio"]')) return "radio";
  if (block.querySelector('[role="listbox"], [role="combobox"]')) return "dropdown";
  if (block.querySelector("textarea")) return "paragraph";
  if (block.querySelector('input[type="date"]')) return "date";
  if (block.querySelector('input[type="time"]')) return "time";
  if (block.querySelector('input[type="email"]')) return "email";
  if (block.querySelector('input[type="number"]')) return "number";
  if (block.querySelector('input[type="text"], input:not([type])')) return "short_text";
  return "unknown";
}

function getOptions(block) {
  return unique(
    [...block.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"]')]
      .map(getChoiceLabel)
      .filter((label) => !/^(Clear selection|Choose|Select|Other:?)$/i.test(label))
  );
}

function getCurrentValue(block, type) {
  if (["short_text", "email", "number", "date", "time"].includes(type)) {
    return block.querySelector('input[type="text"], input[type="email"], input[type="number"], input[type="date"], input[type="time"], input:not([type])')?.value || "";
  }
  if (type === "paragraph") return block.querySelector("textarea")?.value || "";
  if (type === "radio") {
    const selected = [...block.querySelectorAll('[role="radio"]')].find((choice) => choice.getAttribute("aria-checked") === "true");
    return selected ? getChoiceLabel(selected) : "";
  }
  if (type === "checkbox") {
    return [...block.querySelectorAll('[role="checkbox"]')]
      .filter((choice) => choice.getAttribute("aria-checked") === "true")
      .map(getChoiceLabel);
  }
  return "";
}

function getQuestionBlocks() {
  const blocks = [...document.querySelectorAll('[role="listitem"]')].filter((block) => {
    const type = detectType(block);
    const label = getQuestionText(block, 0);
    return type !== "unknown" && label && !/^Submit$/i.test(label);
  });

  if (blocks.length) return blocks;

  return [...document.querySelectorAll(".Qr7Oae")].filter((block) => detectType(block) !== "unknown");
}

function scanForm() {
  const blocks = getQuestionBlocks();
  const questions = blocks.map((block, index) => {
    const questionText = getQuestionText(block, index);
    const type = detectType(block);
    return {
      id: `q_${index}`,
      index,
      question: questionText,
      description: getDescription(block, questionText),
      type,
      required: detectRequired(block),
      options: getOptions(block),
      currentValue: getCurrentValue(block, type)
    };
  });

  const form = {
    url: location.href,
    title: getTitle(),
    questions
  };

  LF_STATE.lastForm = form;
  return form;
}

function setNativeValue(element, value) {
  const proto = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function normalizeChoice(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,:;()\[\]{}]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeVi(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function textInput(block) {
  return block.querySelector('input[type="text"], input[type="email"], input[type="number"], input[type="date"], input[type="time"], input:not([type])');
}

function clearTextFields(block) {
  const input = textInput(block);
  const textarea = block.querySelector("textarea");
  if (input) setNativeValue(input, "");
  if (textarea) setNativeValue(textarea, "");
  return Boolean(input || textarea);
}

function isRateOrNumberQuestion(question) {
  const q = normalizeVi(`${question.question} ${question.description || ""}`);
  return /bao gia|booking|rate|fee|phi|gia video|chi phi|cat xe|quote|price|follower|gmv|doanh thu|doanh so|chi so|so san pham|so don|don hang|san luong|ban duoc/.test(q);
}

function hasInvalidNumberValue(block, question) {
  if (!isRateOrNumberQuestion(question)) return false;
  const value = textInput(block)?.value || block.querySelector("textarea")?.value || "";
  return Boolean(value.trim()) && !/^[0-9]+$/.test(value.trim());
}

function findBestChoice(block, answer) {
  const expected = normalizeChoice(answer);
  const choices = [...block.querySelectorAll('[role="radio"], [role="checkbox"]')];

  let best = null;
  let bestScore = 0;

  for (const choice of choices) {
    const label = getChoiceLabel(choice);
    const norm = normalizeChoice(label);
    let score = 0;
    if (norm === expected) score = 1;
    else if (norm.includes(expected) || expected.includes(norm)) score = 0.85;
    else {
      const expectedWords = new Set(expected.split(" ").filter(Boolean));
      const words = norm.split(" ").filter(Boolean);
      const overlap = words.filter((word) => expectedWords.has(word)).length;
      score = overlap / Math.max(words.length, expectedWords.size, 1);
    }

    if (score > bestScore) {
      bestScore = score;
      best = choice;
    }
  }

  return bestScore >= 0.55 ? best : null;
}

function findOtherChoice(block, role) {
  return [...block.querySelectorAll(`[role="${role}"]`)].find((choice) => /^other:?$/i.test(getChoiceLabel(choice)));
}

function fillOtherText(block, value) {
  const inputs = [...block.querySelectorAll('input[type="text"], input:not([type])')]
    .filter((input) => !input.disabled && input.offsetParent !== null);
  const input = inputs.find((item) => !item.value || /^other$/i.test(item.getAttribute("aria-label") || "")) || inputs.at(-1);
  if (!input) return false;
  setNativeValue(input, String(value));
  return true;
}

function clickOtherChoice(block, role, answer) {
  const other = findOtherChoice(block, role);
  if (!other) return false;
  other.click();
  fillOtherText(block, answer);
  return true;
}

async function chooseDropdown(block, answer) {
  const dropdown = block.querySelector('[role="listbox"], [role="combobox"]');
  if (!dropdown) return false;
  dropdown.click();
  await new Promise((resolve) => setTimeout(resolve, 160));

  const expected = normalizeChoice(answer);
  const options = [...document.querySelectorAll('[role="option"]')].filter((option) => textOf(option));
  const match = options.find((option) => normalizeChoice(textOf(option)) === expected) ||
    options.find((option) => normalizeChoice(textOf(option)).includes(expected));

  if (match) {
    match.click();
    return true;
  }

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  return false;
}

function markQuestion(block, status, answer) {
  block.dataset.localformStatus = status;
  let chip = block.querySelector(".lf-chip");
  if (!chip) {
    chip = document.createElement("div");
    chip.className = "lf-chip";
    block.appendChild(chip);
  }

  const labels = {
    filled: "✓ filled",
    review: "? review",
    skipped: "– skipped",
    failed: "! check"
  };
  chip.textContent = `${labels[status] || status}${answer ? ` · ${Array.isArray(answer) ? answer.join(", ") : answer}` : ""}`;
}

async function fillOne(block, question, answerItem, settings = {}) {
  const answer = answerItem?.answer;
  const lowConfidence = Number(answerItem?.confidence || 0) < Number(settings.confidenceThreshold || 0.72);
  const shouldReview = answerItem?.needsReview || lowConfidence;

  if (answer == null || answer === "" || (Array.isArray(answer) && !answer.length)) {
    if (answerItem?.clearExisting || hasInvalidNumberValue(block, question)) clearTextFields(block);
    markQuestion(block, "skipped", "");
    return { questionId: question.id, ok: false, status: "skipped" };
  }

  if (shouldReview && !settings.autoFillLowConfidence) {
    if (hasInvalidNumberValue(block, question)) clearTextFields(block);
    markQuestion(block, "review", answer);
    return { questionId: question.id, ok: false, status: "review" };
  }

  const type = question.type;

  if (["short_text", "email", "number", "date", "time"].includes(type)) {
    const input = textInput(block);
    if (input) {
      setNativeValue(input, String(answer));
      markQuestion(block, "filled", answer);
      return { questionId: question.id, ok: true, status: "filled" };
    }
  }

  if (type === "paragraph") {
    const textarea = block.querySelector("textarea");
    if (textarea) {
      setNativeValue(textarea, String(answer));
      markQuestion(block, "filled", answer);
      return { questionId: question.id, ok: true, status: "filled" };
    }
  }

  if (type === "radio") {
    const choice = findBestChoice(block, String(answer));
    if (choice) {
      choice.click();
      markQuestion(block, "filled", answer);
      return { questionId: question.id, ok: true, status: "filled" };
    }
    if (clickOtherChoice(block, "radio", answer)) {
      markQuestion(block, "filled", answer);
      return { questionId: question.id, ok: true, status: "filled" };
    }
  }

  if (type === "checkbox") {
    const values = Array.isArray(answer) ? answer : [answer];
    let clicked = 0;
    for (const value of values) {
      const choice = findBestChoice(block, String(value));
      if (choice && choice.getAttribute("aria-checked") !== "true") {
        choice.click();
        clicked += 1;
      }
    }
    if (!clicked && values.length === 1 && clickOtherChoice(block, "checkbox", values[0])) {
      clicked += 1;
    }
    if (clicked) {
      markQuestion(block, "filled", values.join(", "));
      return { questionId: question.id, ok: true, status: "filled" };
    }
  }

  if (type === "dropdown") {
    const ok = await chooseDropdown(block, String(answer));
    if (ok) {
      markQuestion(block, "filled", answer);
      return { questionId: question.id, ok: true, status: "filled" };
    }
  }

  markQuestion(block, "failed", answer);
  return { questionId: question.id, ok: false, status: "failed" };
}

async function fillForm(payload) {
  const form = LF_STATE.lastForm || scanForm();
  const blocks = getQuestionBlocks();
  const answersById = new Map((payload.answers || []).map((answer) => [answer.questionId, answer]));
  const settings = payload.settings || {};
  const results = [];

  for (const question of form.questions) {
    const block = blocks[question.index];
    const answerItem = answersById.get(question.id);
    if (!block || !answerItem) continue;
    results.push(await fillOne(block, question, answerItem, settings));
  }

  LF_STATE.lastAnswers = payload;
  showPanel(payload, results);
  return results;
}

function submitForm() {
  const buttons = [...document.querySelectorAll('[role="button"], button')];
  const submit = buttons.find((button) => /^(submit|gửi|gui)$/i.test(textOf(button))) ||
    buttons.find((button) => /submit|gửi|gui/i.test(textOf(button)));

  if (!submit) {
    return { ok: false, error: "Submit button not found" };
  }

  submit.click();
  return { ok: true };
}

function showPanel(payload, results = []) {
  let panel = document.querySelector("#localform-panel");
  if (!panel) {
    panel = document.createElement("aside");
    panel.id = "localform-panel";
    document.body.appendChild(panel);
  }

  const filled = results.filter((r) => r.status === "filled").length;
  const review = results.filter((r) => r.status === "review").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const isWorking = payload.status === "working";
  const isError = payload.status === "error";

  panel.innerHTML = `
    <div class="lf-head">
      <div class="lf-mark">⌁</div>
      <div>
        <strong>LocalForm</strong>
        <span>${payload.summary || "Draft ready"}</span>
      </div>
      <button class="lf-close" type="button" aria-label="Close">×</button>
    </div>
    ${isWorking || isError ? "" : `
      <div class="lf-stats">
        <span>✓ ${filled}</span>
        <span>? ${review}</span>
        <span>– ${skipped}</span>
        <span>! ${failed}</span>
      </div>
    `}
    <p>${payload.note || (isWorking ? "Preparing a local draft..." : "Review highlighted fields. Extension never submits for you.")}</p>
  `;

  panel.querySelector(".lf-close").addEventListener("click", () => panel.remove());
}

function sendRuntime(message) {
  return chrome.runtime.sendMessage(message);
}

function hasUsableQuestions(form) {
  return Array.isArray(form?.questions) && form.questions.length > 0;
}

async function runMagicMode() {
  if (location.hash.includes("localform-queue")) return;
  if (LF_STATE.magicRunning || LF_STATE.magicDoneForUrl === location.href) return;
  LF_STATE.magicRunning = true;

  try {
    const settingsResp = await sendRuntime({ type: "GET_SETTINGS" });
    if (!settingsResp?.ok || !settingsResp.settings?.magicMode) return;

    const delay = Math.max(300, Number(settingsResp.settings.magicDelayMs || 1200));
    await new Promise((resolve) => setTimeout(resolve, delay));

    const form = scanForm();
    if (!hasUsableQuestions(form)) return;

    LF_STATE.magicDoneForUrl = location.href;
    showPanel({
      status: "working",
      summary: "Auto-draft is running",
      note: "Scanning this form and preparing safe local answers."
    });

    const gen = await sendRuntime({ type: "GENERATE_ANSWERS", form });
    if (!gen?.ok) throw new Error(gen?.error || "Could not generate answers");

    await fillForm({
      ...gen.result,
      settings: {
        confidenceThreshold: settingsResp.settings.confidenceThreshold,
        autoFillLowConfidence: settingsResp.settings.autoFillLowConfidence
      }
    });
  } catch (error) {
    showPanel({
      status: "error",
      summary: "Auto-draft paused",
      note: error.message || String(error)
    });
  } finally {
    LF_STATE.magicRunning = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "SCAN_FORM") {
      const form = scanForm();
      sendResponse({ ok: true, form });
      return;
    }

    if (message?.type === "FILL_FORM") {
      const results = await fillForm(message.payload || {});
      sendResponse({ ok: true, results });
      return;
    }

    if (message?.type === "SHOW_PANEL") {
      showPanel(message.payload || {}, []);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "SUBMIT_FORM") {
      sendResponse(submitForm());
      return;
    }
  })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

runMagicMode();
