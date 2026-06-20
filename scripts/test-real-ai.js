#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");

const endpoint = process.env.OLLAMA_ENDPOINT || "http://localhost:11434";
const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";

const profile = {
  fullName: "Nguyễn Như Hằng",
  creatorName: "thanhchamchi_231",
  tiktokHandle: "thanhchamchi_231",
  tiktokUrl: "https://www.tiktok.com/@thanhchamchi_231",
  facebookUrl: "https://facebook.com/thanhchamchi",
  youtubeUrl: "https://youtube.com/@thanhchamchi",
  followers: "2122",
  gmv30Days: "6000000",
  sold30Days: "12",
  zaloPhone: "0369102180",
  email: "nguyennhuhanghcm@gmail.com",
  contentNiche: "beauty, skincare, lifestyle",
  platforms: "TikTok, Facebook",
  videoStyle: "Video POV",
  productPreference: "MATE MADE cushion",
  mcnStatus: "Chưa tham gia UpBase",
  deliverables: "CẢ 2",
  freecastStatus: "Có",
  livestreamCadence: "4 buổi/tuần",
  livestreamHours: "2",
  postingDeadlineDays: "5-6 ngày",
  recipientName: "Như Hằng",
  shippingAddress: "305/6A Lê Văn Sỹ phường 1 quận Tân Bình",
  youtubeRate: "1000000",
  facebookRate: "500000",
  tiktokRate: "700000"
};

const settings = {
  endpoint,
  model,
  temperature: 0,
  confidenceThreshold: 0.72,
  autoFillLowConfidence: false,
  autoStartOllama: false,
  nativeHostName: "ai.localform.host",
  launchTimeoutMs: 22000,
  profile,
  contexts: [
    {
      id: "ctx_test",
      title: "KOC campaign",
      enabled: true,
      body: "Điền form KOC/KOL bằng dữ liệu profile. Không bịa số liệu. Field báo giá phải là số. Field sản phẩm muốn nhận phải là tên sản phẩm."
    }
  ]
};

const chrome = {
  storage: { local: { get: async () => ({ settings }), set: async () => undefined } },
  runtime: {
    lastError: null,
    onInstalled: { addListener: () => undefined },
    onMessage: { addListener: () => undefined },
    sendNativeMessage: (_host, _message, cb) => {
      chrome.runtime.lastError = { message: "Native host disabled in AI test" };
      cb(undefined);
      chrome.runtime.lastError = null;
    }
  }
};

const context = vm.createContext({ chrome, console, URL, fetch, setTimeout, clearTimeout });
vm.runInContext(source, context, { filename: "extension/background.js" });

const { generateAnswers } = context;
assert.equal(typeof generateAnswers, "function", "generateAnswers is loadable");

function q(id, question, type = "short_text", extras = {}) {
  return {
    id,
    index: Number(id.replace(/\D/g, "")) || 0,
    question,
    description: "",
    type,
    required: true,
    options: [],
    currentValue: "",
    ...extras
  };
}

const form = {
  url: "https://docs.google.com/forms/d/e/fake/viewform",
  title: "[LIVESTREAM AFFILIATE TIKTOK] ĐĂNG KÝ LIVESTREAM CHO SẢN PHẨM MATE MADE",
  questions: [
    q("q1", "ID kênh tiktok của bạn sau @"),
    q("q2", "Link kênh Tiktok của bạn"),
    q("q3", "Số follower (Điền đầy đủ số, ví dụ: 1000)"),
    q("q4", "GMV 30 ngày gần nhất trên kênh"),
    q("q5", "Số sản phẩm bạn bán được trong 30 ngày gần nhất trên kênh", "short_text", { currentValue: "Review unbox" }),
    q("q6", "Bạn đăng ký livestream hay video", "radio", { options: ["LIVE", "VIDEO", "CẢ 2"] }),
    q("q7", "Số điện thoại Zalo"),
    q("q8", "Email cá nhân"),
    q("q9", "Báo giá video TikTok", "short_text", { currentValue: "thanhchamchi_231" }),
    q("q10", "Báo giá Facebook reel/post"),
    q("q11", "Sản phẩm bạn muốn nhận: chọn 1 sản phẩm và viết đầy đủ tên", "short_text", {
      currentValue: "https://www.tiktok.com/@thanhchamchi_231"
    }),
    q("q12", "Tên người nhận hàng"),
    q("q13", "Địa chỉ nhận sản phẩm trước sáp nhập"),
    q("q13b", "Số điện thoại người nhận hàng"),
    q("q14", "Phong cách video và livestream của bạn", "radio", {
      options: ["Video lộ mặt", "Video không lộ mặt", "Video POV", "Other"]
    }),
    q("q15", "Video bắt buộc REVIEW THẬT + CÓ TRẢI NGHIỆM, bạn có phù hợp không nè", "radio", {
      options: ["Có", "Không"]
    }),
    q("q16", "Bạn có đồng ý làm freecast và lên video sau 5-6 ngày khi nhận hàng không", "radio", {
      options: ["Có", "Không"]
    }),
    q("q17", "Bạn đã tham gia liên kết MCN UpBase chưa", "radio", { options: ["Có", "Không"] }),
    q("q18", "Một buổi livestream kéo dài tối thiểu bao nhiêu tiếng?"),
    q("q19", "Bạn livestream được mấy buổi mỗi tuần?"),
    q("q20", "Bạn có thể đăng bài trên nền tảng nào?", "checkbox", {
      options: ["TikTok", "Facebook", "YouTube", "Instagram"]
    })
  ]
};

function byId(result) {
  return new Map(result.answers.map((answer) => [answer.questionId, answer]));
}

function expectAnswer(answers, id, value) {
  assert.deepEqual(answers.get(id)?.answer, value, `${id} answer`);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectDigits(answers, id) {
  const value = String(answers.get(id)?.answer ?? "");
  assert.match(value, /^[0-9]+$/, `${id} should be digits, got ${JSON.stringify(value)}`);
}

async function main() {
  try {
    const ping = await fetch(`${endpoint.replace(/\/$/, "")}/api/tags`);
    if (!ping.ok) throw new Error(`Ollama responded ${ping.status}`);
  } catch (error) {
    console.error(`Ollama is not reachable at ${endpoint}. Start Ollama or set OLLAMA_ENDPOINT.`);
    console.error(error.message || String(error));
    process.exit(2);
  }

  const result = await generateAnswers(form);
  const answers = byId(result);

  expectAnswer(answers, "q1", "thanhchamchi_231");
  expectAnswer(answers, "q2", "https://www.tiktok.com/@thanhchamchi_231");
  expectDigits(answers, "q3");
  expectDigits(answers, "q4");
  expectAnswer(answers, "q5", "12");
  expectAnswer(answers, "q6", "CẢ 2");
  expectAnswer(answers, "q7", "0369102180");
  expectAnswer(answers, "q8", "nguyennhuhanghcm@gmail.com");
  expectAnswer(answers, "q9", "700000");
  expectAnswer(answers, "q10", "500000");
  expectAnswer(answers, "q11", "MATE MADE cushion");
  expectAnswer(answers, "q12", "Như Hằng");
  expectAnswer(answers, "q13", "305/6A Lê Văn Sỹ phường 1 quận Tân Bình");
  expectAnswer(answers, "q13b", "0369102180");
  expectAnswer(answers, "q14", "Video POV");
  expectAnswer(answers, "q15", "Có");
  expectAnswer(answers, "q16", "Có");
  expectAnswer(answers, "q17", "Không");
  expectAnswer(answers, "q18", "2");
  expectAnswer(answers, "q19", "4 buổi/tuần");
  assert.deepEqual(plain(answers.get("q20")?.answer), ["TikTok", "Facebook"], "q20 platforms");

  settings.profile = {
    ...profile,
    tiktokRate: "",
    facebookRate: "",
    youtubeRate: "",
    freecastStatus: "Có"
  };

  const freecastResult = await generateAnswers({
    url: "https://docs.google.com/forms/d/e/fake/viewform",
    title: "[FREECAST] ĐĂNG KÝ CAMPAIGN BEAUTY",
    questions: [
      q("f1", "Báo giá video TikTok", "short_text", { currentValue: "thanhchamchi_231" }),
      q("f2", "Receiver phone number")
    ]
  });
  const freecastAnswers = byId(freecastResult);
  expectAnswer(freecastAnswers, "f1", "0");
  expectAnswer(freecastAnswers, "f2", "0369102180");

  console.log(`Real AI eval passed with ${model}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
