#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");

const chrome = {
  storage: { local: { get: async () => ({}), set: async () => undefined } },
  runtime: {
    lastError: null,
    onInstalled: { addListener: () => undefined },
    onMessage: { addListener: () => undefined },
    sendNativeMessage: () => undefined
  }
};

const context = vm.createContext({
  chrome,
  console,
  URL,
  fetch: async () => {
    throw new Error("fetch should not run in rule tests");
  }
});

vm.runInContext(source, context, { filename: "extension/background.js" });

const { mergeProfileFallbacks } = context;
assert.equal(typeof mergeProfileFallbacks, "function", "background rule function is loadable");

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
  tiktokRate: "700000",
  facebookRate: "500000",
  youtubeRate: "1000000"
};

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

function runCase(name, question, modelAnswer, expected, customProfile = profile) {
  const form = {
    title: "[LIVESTREAM AFFILIATE TIKTOK] ĐĂNG KÝ LIVESTREAM CHO SẢN PHẨM MATE MADE",
    questions: [question]
  };
  const payload = {
    summary: "",
    answers: modelAnswer === undefined ? [] : [{ questionId: question.id, ...modelAnswer }]
  };
  const result = mergeProfileFallbacks(payload, form, { profile: customProfile });
  const answer = result.answers[0];
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(answer[key], value, `${name}: expected ${key}`);
  }
}

runCase(
  "rate field overrides TikTok handle with saved TikTok rate",
  q("q1", "8.Báo giá video TikTok"),
  { answer: "thanhchamchi_231", confidence: 0.91, needsReview: false, reason: "model" },
  { answer: "700000", needsReview: false }
);

runCase(
  "rate field clears invalid prefilled handle when no rate is saved",
  q("q2", "8.Báo giá video TikTok", "short_text", { currentValue: "thanhchamchi_231" }),
  { answer: null, confidence: 0, needsReview: true, reason: "missing" },
  { answer: "0", needsReview: false },
  { ...profile, tiktokRate: "" }
);

runCase(
  "freecast fills empty rate with zero",
  q("q2b", "8.Báo giá video TikTok"),
  { answer: "thanhchamchi_231", confidence: 0.91, needsReview: false, reason: "model" },
  { answer: "0", needsReview: false },
  { ...profile, tiktokRate: "" }
);

runCase(
  "video style radio picks matching saved style",
  q("q3", "11. Phong cách video và livestream của bạn", "radio", {
    options: ["Video lộ mặt", "Video không lộ mặt", "Video POV"]
  }),
  { answer: null, confidence: 0, needsReview: true, reason: "missing" },
  { answer: "Video POV", needsReview: false }
);

runCase(
  "video style uses Other text when no listed option matches",
  q("q4", "11. Phong cách video và livestream của bạn", "radio", {
    options: ["Video lộ mặt", "Video không lộ mặt", "Other"]
  }),
  { answer: null, confidence: 0, needsReview: true, reason: "missing" },
  { answer: "Video POV", needsReview: false }
);

runCase(
  "sold count overrides descriptive text",
  q("q5", "Số sản phẩm bạn bán được trong 30 ngày gần nhất trên kênh"),
  { answer: "Review unbox", confidence: 0.93, needsReview: false, reason: "model" },
  { answer: "12", needsReview: false }
);

runCase(
  "product wanted overrides TikTok URL",
  q("q6", "Sản phẩm bạn muốn nhận: chọn 1 sản phẩm và viết đầy đủ tên"),
  { answer: "https://www.tiktok.com/@thanhchamchi_231", confidence: 0.9, needsReview: false, reason: "model" },
  { answer: "MATE MADE cushion", needsReview: false }
);

runCase(
  "recipient name does not become shipping address",
  q("q12", "Tên người nhận hàng"),
  { answer: "305/6A Lê Văn Sỹ phường 1 quận Tân Bình", confidence: 0.9, needsReview: false, reason: "model" },
  { answer: "Như Hằng", needsReview: false }
);

runCase(
  "recipient phone uses Zalo number",
  q("q12b", "Số điện thoại người nhận hàng"),
  { answer: null, confidence: 0, needsReview: true, reason: "missing" },
  { answer: "0369102180", needsReview: false }
);

runCase(
  "receiver number uses Zalo number",
  q("q12c", "Receiver number"),
  { answer: "Như Hằng", confidence: 0.9, needsReview: false, reason: "model" },
  { answer: "0369102180", needsReview: false }
);

runCase(
  "shipping address stays address",
  q("q13", "Địa chỉ nhận sản phẩm trước sáp nhập"),
  { answer: "Như Hằng", confidence: 0.9, needsReview: false, reason: "model" },
  { answer: "305/6A Lê Văn Sỹ phường 1 quận Tân Bình", needsReview: false }
);

runCase(
  "TikTok ID after @ strips leading at sign",
  q("q7", "ID kênh tiktok của bạn sau @"),
  { answer: "@thanhchamchi_231", confidence: 0.8, needsReview: true, reason: "model" },
  { answer: "thanhchamchi_231", needsReview: false }
);

runCase(
  "freecast radio uses saved commitment",
  q("q8", "Bạn có đồng ý làm freecast không", "radio", { options: ["Có", "Không"] }),
  { answer: null, confidence: 0, needsReview: true, reason: "missing" },
  { answer: "Có", needsReview: false }
);

runCase(
  "MCN status radio uses saved status",
  q("q9", "Bạn đã tham gia liên kết MCN UpBase chưa", "radio", { options: ["Có", "Không"] }),
  { answer: null, confidence: 0, needsReview: true, reason: "missing" },
  { answer: "Không", needsReview: false }
);

runCase(
  "deliverables radio uses saved registration type",
  q("q10", "Bạn đăng ký livestream hay video", "radio", { options: ["LIVE", "VIDEO", "CẢ 2"] }),
  { answer: "LIVE", confidence: 0.9, needsReview: false, reason: "model" },
  { answer: "CẢ 2", needsReview: false }
);

runCase(
  "posting deadline commitment uses saved deadline",
  q("q11", "Bạn có đồng ý lên video sau 5-6 ngày khi nhận hàng không", "radio", { options: ["Có", "Không"] }),
  { answer: null, confidence: 0, needsReview: true, reason: "missing" },
  { answer: "Có" }
);

runCase(
  "livestream duration beats cadence",
  q("q18", "Một buổi livestream kéo dài tối thiểu bao nhiêu tiếng?"),
  { answer: "4 buổi/tuần", confidence: 0.9, needsReview: false, reason: "model" },
  { answer: "2", needsReview: false }
);

runCase(
  "livestream cadence stays cadence",
  q("q19", "Bạn livestream được mấy buổi mỗi tuần?"),
  { answer: "2", confidence: 0.9, needsReview: false, reason: "model" },
  { answer: "4 buổi/tuần", needsReview: false }
);

console.log("Rule tests passed");
