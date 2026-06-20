const NATIVE_HOST_NAME = "ai.localform.host";

const DEFAULT_SETTINGS = {
  endpoint: "http://localhost:11434",
  model: "qwen2.5:7b",
  temperature: 0.2,
  confidenceThreshold: 0.72,
  autoFillLowConfidence: false,
  magicMode: true,
  magicDelayMs: 1200,
  autoStartOllama: true,
  nativeHostName: NATIVE_HOST_NAME,
  launchTimeoutMs: 22000,
  profile: {
    fullName: "",
    creatorName: "",
    tiktokHandle: "",
    tiktokUrl: "",
    facebookUrl: "",
    youtubeUrl: "",
    followers: "",
    gmv30Days: "",
    sold30Days: "",
    zaloPhone: "",
    email: "",
    contentNiche: "",
    platforms: "",
    videoStyle: "",
    productPreference: "",
    mcnStatus: "",
    deliverables: "",
    freecastStatus: "",
    livestreamCadence: "",
    livestreamHours: "",
    postingDeadlineDays: "",
    recipientName: "",
    shippingAddress: "",
    youtubeRate: "",
    facebookRate: "",
    tiktokRate: ""
  },
  contexts: [
    {
      id: "ctx_beauty",
      title: "KOC beauty / skincare",
      enabled: true,
      body: "Ưu tiên câu trả lời tự nhiên, phù hợp creator beauty/skincare/lifestyle. Nếu form hỏi cam kết review thật, freecast, lịch livestream hoặc đăng video đúng hạn thì trả lời Có khi profile không mâu thuẫn. Không bịa chỉ số follower, GMV, số điện thoại, email hoặc địa chỉ."
    },
    {
      id: "ctx_game",
      title: "KOC game / casual content",
      enabled: true,
      body: "Ưu tiên nhóm nội dung game mobile casual, office life hoặc lifestyle nếu phù hợp profile. Báo giá chỉ điền số, không thêm chữ, không thêm ký hiệu tiền tệ nếu form yêu cầu chỉ số."
    }
  ]
};

async function getSettings() {
  const data = await chrome.storage.local.get(["settings"]);
  return deepMerge(DEFAULT_SETTINGS, data.settings || {});
}

function deepMerge(base, override) {
  if (Array.isArray(base)) return Array.isArray(override) ? override : base;
  if (typeof base !== "object" || base === null) return override ?? base;
  const out = { ...base };
  for (const key of Object.keys(override || {})) {
    out[key] = key in base ? deepMerge(base[key], override[key]) : override[key];
  }
  return out;
}

function normalizeEndpoint(endpoint) {
  return String(endpoint || DEFAULT_SETTINGS.endpoint).replace(/\/$/, "");
}

function isLoopbackEndpoint(endpoint) {
  try {
    const url = new URL(normalizeEndpoint(endpoint));
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  } catch (_) {
    return false;
  }
}

async function pingOllama(settings) {
  const endpoint = normalizeEndpoint(settings.endpoint);
  const res = await fetch(`${endpoint}/api/tags`, {
    method: "GET",
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  return res.json();
}

async function nativeRequest(command, payload = {}) {
  return new Promise((resolve, reject) => {
    const hostName = payload.nativeHostName || NATIVE_HOST_NAME;
    chrome.runtime.sendNativeMessage(hostName, { command, ...payload }, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message || "Native host unavailable"));
        return;
      }
      if (!response) {
        reject(new Error("Native host returned no response"));
        return;
      }
      if (response.ok === false) {
        reject(new Error(response.error || "Native host error"));
        return;
      }
      resolve(response);
    });
  });
}

async function ensureOllama(settings, { forceStart = false } = {}) {
  try {
    const result = await pingOllama(settings);
    return { ok: true, ready: true, started: false, mode: "http", result };
  } catch (pingError) {
    if (!settings.autoStartOllama && !forceStart) {
      throw pingError;
    }

    if (!isLoopbackEndpoint(settings.endpoint)) {
      throw new Error("Auto-start only works with localhost / 127.0.0.1 endpoints.");
    }

    const response = await nativeRequest("ensure_ollama", {
      endpoint: normalizeEndpoint(settings.endpoint),
      timeoutMs: Number(settings.launchTimeoutMs || 22000),
      nativeHostName: settings.nativeHostName || NATIVE_HOST_NAME
    });

    const result = await pingOllama(settings);
    return {
      ok: true,
      ready: true,
      started: Boolean(response.started),
      mode: "native",
      native: response,
      result
    };
  }
}

function compactProfile(profile = {}) {
  return Object.entries(profile)
    .filter(([, value]) => String(value || "").trim())
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}


function normalizeVi(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9@._:/\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstFilled(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function onlyDigits(value) {
  const text = String(value || "");
  const digits = text.replace(/[^0-9]/g, "");
  return digits || text.trim();
}

function hasDigitsOnly(value) {
  return /^[0-9]+$/.test(String(value || "").trim());
}

function looksLikeUrlOrContact(value) {
  return /https?:\/\/|www\.|tiktok\.com|facebook\.com|youtube\.com|@.+\..+|^[+0-9()\-\s]{8,}$/i.test(String(value || "").trim());
}

function isRateQuestion(q) {
  return /bao gia|báo giá|booking|rate|fee|phi|phí|gia video|giá video|chi phi|chi phí|cat xe|cát xê|quote|price/.test(q);
}

function isVideoStyleQuestion(q) {
  return /phong cach|phong cách|style|format|kieu video|kiểu video|lo mat|lộ mặt|pov|livestream cua ban|livestream của bạn/.test(q);
}

function isDeadlineQuestion(q) {
  return /5-6 ngay|5 6 ngay|deadline|\bhan\b|dung han|đúng hạn|timeline|timline|sau khi nhan hang|sau khi nhận hàng/.test(q);
}

function isSoldCountQuestion(q) {
  return /so san pham|số sản phẩm|so don|số đơn|don hang|đơn hàng|san luong|sản lượng|ban duoc|bán được/.test(q);
}

function isProductWantedQuestion(q) {
  return /san pham|sản phẩm|product|sample/.test(q) &&
    /muon nhan|muốn nhận|chon 1|chọn 1|viet day du ten|viết đầy đủ tên|nhan sample|nhận sample/.test(q) &&
    !isSoldCountQuestion(q);
}

function campaignProductFromForm(form = {}) {
  const raw = String(form.title || "");
  const afterProduct = raw.match(/sản phẩm\s+([A-Z0-9][A-Z0-9\s&+\-.]{2,40})/i);
  if (afterProduct?.[1]) return cleanCampaignProduct(afterProduct[1]);
  const quoted = raw.match(/"([^"]{2,40})"/);
  if (quoted?.[1]) return cleanCampaignProduct(quoted[1]);
  return "";
}

function cleanCampaignProduct(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^(cua|của)\s+/i, "")
    .replace(/[.。,:;)\]]+$/g, "")
    .trim();
}

function videoStyleCandidates(value) {
  const raw = String(value || "").trim();
  const norm = normalizeVi(raw);
  const candidates = [raw];

  if (/pov|point of view/.test(norm)) candidates.push("Video POV", "POV");
  if (/(khong|ko|k)\s*lo\s*mat|an danh|anonymous/.test(norm)) {
    candidates.push("Video không lộ mặt", "không lộ mặt");
  }
  if (/(co|có)?\s*lo\s*mat|face|lộ mặt/.test(norm) && !/(khong|ko|k)\s*lo\s*mat/.test(norm)) {
    candidates.push("Video lộ mặt", "lộ mặt");
  }
  if (/review/.test(norm)) candidates.push("Review", "review thật");
  if (/unbox|mo hop|mở hộp/.test(norm)) candidates.push("Unbox", "Review unbox");

  return [...new Set(candidates.filter(Boolean))];
}

function tiktokHandleFromProfile(profile = {}) {
  const raw = firstFilled(profile.tiktokHandle, profile.creatorName);
  if (raw) return raw.replace(/^@+/, "").trim();
  const url = String(profile.tiktokUrl || "");
  const match = url.match(/tiktok\.com\/@([^/?#\s]+)/i);
  return match ? match[1].trim() : "";
}

function tiktokUrlFromProfile(profile = {}) {
  const explicit = String(profile.tiktokUrl || "").trim();
  if (explicit) return explicit;
  const handle = tiktokHandleFromProfile(profile);
  return handle ? `https://www.tiktok.com/@${handle}` : "";
}

function optionMatch(question, candidates) {
  const options = question.options || [];
  if (!options.length) return null;
  const normalized = options.map((label) => ({ label, norm: normalizeVi(label) }));
  for (const candidate of candidates.filter(Boolean)) {
    const target = normalizeVi(candidate);
    const exact = normalized.find((item) => item.norm === target);
    if (exact) return exact.label;
    const contains = normalized.find((item) => item.norm.includes(target) || target.includes(item.norm));
    if (contains) return contains.label;
  }
  return null;
}

function positiveOption(question) {
  return optionMatch(question, [
    "co", "có", "dong y", "đồng ý", "toi dong y", "tôi đồng ý",
    "yes", "ok", "san sang", "sẵn sàng", "chap nhan", "chấp nhận"
  ]);
}

function hasPositiveStatus(value) {
  const status = normalizeVi(value);
  return /(^|\s)(co|yes|ok|dong y|san sang|chap nhan)($|\s)/.test(status) && !/(khong|chua|no)/.test(status);
}

function isPhoneQuestion(q) {
  return /zalo|dien thoai|điện thoại|phone|sdt|sđt|lien he|liên hệ|receiver number|recipient number|receiver phone|recipient phone|so nguoi nhan|số người nhận|so dien thoai nguoi nhan|số điện thoại người nhận/.test(q);
}

function answerFromProfile(question, profile = {}, form = {}) {
  const q = normalizeVi(`${question.question} ${question.description || ""}`);
  const type = question.type;
  const handle = tiktokHandleFromProfile(profile);
  const tiktokUrl = tiktokUrlFromProfile(profile);

  const make = (answer, confidence = 0.94, reason = "khớp từ hồ sơ") => {
    if (answer == null || answer === "" || (Array.isArray(answer) && !answer.length)) return null;
    return { answer, confidence, needsReview: confidence < 0.9, reason };
  };

  if (isRateQuestion(q)) {
    let rate = "";
    if (/youtube|ytb/.test(q)) rate = profile.youtubeRate;
    else if (/facebook|fb/.test(q)) rate = profile.facebookRate;
    else if (/tiktok|video|short/.test(q)) rate = profile.tiktokRate;
    else rate = firstFilled(profile.tiktokRate, profile.facebookRate, profile.youtubeRate);
    if (rate) return make(onlyDigits(rate), 0.95, "báo giá từ hồ sơ");
    if (hasPositiveStatus(profile.freecastStatus)) return make("0", 0.92, "freecast nên báo giá bằng 0");
  }

  // TikTok identity. If the form says "sau @", the expected value is usually without @.
  if (!isRateQuestion(q) && /tiktok|tik tok/.test(q)) {
    if (/id|username|tai khoan|tài khoản|sau @|sau/.test(q) && handle) {
      return make(handle, /sau @|sau/.test(q) ? 0.99 : 0.96, "ID TikTok từ hồ sơ");
    }
    if (/link|url|duong dan|đường dẫn|kenh|kênh/.test(q) && tiktokUrl) {
      return make(tiktokUrl, 0.98, "link TikTok từ hồ sơ");
    }
  }

  if (/facebook|fb|fanpage/.test(q) && profile.facebookUrl) return make(profile.facebookUrl, 0.95, "link Facebook từ hồ sơ");
  if (/youtube|ytb|yt/.test(q) && profile.youtubeUrl) return make(profile.youtubeUrl, 0.95, "link YouTube từ hồ sơ");

  if (/follower|follow|nguoi theo doi|người theo dõi|subscriber|sub/.test(q) && profile.followers) {
    return make(onlyDigits(profile.followers), 0.96, "số follower từ hồ sơ");
  }

  if (/gmv|doanh thu|sales|doanh so|doanh số/.test(q) && profile.gmv30Days) {
    return make(onlyDigits(profile.gmv30Days), 0.94, "GMV từ hồ sơ");
  }

  if (isSoldCountQuestion(q) && profile.sold30Days) {
    return make(onlyDigits(profile.sold30Days), 0.94, "số đơn từ hồ sơ");
  }

  if (isPhoneQuestion(q) && profile.zaloPhone) {
    return make(profile.zaloPhone, 0.96, "Zalo/SĐT từ hồ sơ");
  }

  if (/email|e-mail|mail/.test(q) && profile.email) return make(profile.email, 0.98, "email từ hồ sơ");

  if (isDeadlineQuestion(q) && profile.postingDeadlineDays) {
    if (["radio", "checkbox", "dropdown"].includes(type)) {
      const positive = positiveOption(question);
      if (positive) return make(type === "checkbox" ? [positive] : positive, 0.86, "deadline đăng bài từ hồ sơ");
    }
    return make(profile.postingDeadlineDays, 0.88, "deadline đăng bài từ hồ sơ");
  }

  if (/ho ten|họ tên|ten nguoi nhan|tên người nhận|full name|name/.test(q)) {
    const name = firstFilled(profile.recipientName, profile.fullName, profile.creatorName);
    if (name) return make(name, 0.95, "tên từ hồ sơ");
  }

  if (!/ten nguoi nhan|tên người nhận/.test(q) && /dia chi|địa chỉ|address|nhan hang|nhận hàng|giao hang|giao hàng|shipping/.test(q)) {
    const address = firstFilled(profile.shippingAddress);
    if (address) return make(address, 0.96, "địa chỉ từ hồ sơ");
  }

  if (isProductWantedQuestion(q)) {
    const product = firstFilled(profile.productPreference, campaignProductFromForm(form));
    if (product) return make(product, profile.productPreference ? 0.94 : 0.9, profile.productPreference ? "sản phẩm muốn nhận từ hồ sơ" : "sản phẩm suy ra từ tiêu đề form");
  }

  if (/san pham|sản phẩm|nganh hang|ngành hàng|product|category/.test(q) && !isSoldCountQuestion(q)) {
    const product = firstFilled(profile.productPreference, profile.contentNiche);
    if (product) return make(product, 0.9, "sản phẩm/ngách từ hồ sơ");
  }

  if (/nhom noi dung|nhóm nội dung|linh vuc|lĩnh vực|niche|content/.test(q)) {
    const niche = firstFilled(profile.contentNiche, profile.videoStyle);
    if (niche) return make(niche, 0.9, "ngách nội dung từ hồ sơ");
  }

  if (/nen tang|nền tảng|platform|dang bai|đăng bài/.test(q)) {
    if (type === "checkbox") {
      const chosen = [];
      const platforms = normalizeVi(profile.platforms || "");
      for (const wanted of ["TikTok", "Facebook", "YouTube", "Instagram"]) {
        if (platforms.includes(normalizeVi(wanted)) || (wanted === "TikTok" && handle)) {
          const match = optionMatch(question, [wanted]);
          if (match) chosen.push(match);
        }
      }
      if (chosen.length) return make(chosen, 0.9, "nền tảng từ hồ sơ");
    }
    const platform = optionMatch(question, [profile.platforms, "TikTok"]);
    if (platform) return make(platform, 0.9, "nền tảng từ hồ sơ");
  }

  if (isVideoStyleQuestion(q) && profile.videoStyle) {
    if (["radio", "checkbox", "dropdown"].includes(type)) {
      const match = optionMatch(question, videoStyleCandidates(profile.videoStyle));
      if (match) return make(type === "checkbox" ? [match] : match, 0.94, "phong cách video từ hồ sơ");
    }
    return make(profile.videoStyle, 0.93, "phong cách video từ hồ sơ");
  }

  if (/mcn|upbase|lien ket|liên kết|agency|doi tac|đối tác/.test(q) && profile.mcnStatus) {
    if (["radio", "checkbox", "dropdown"].includes(type)) {
      const status = normalizeVi(profile.mcnStatus);
      const match = optionMatch(question, [
        profile.mcnStatus,
        status.includes("chua") || status.includes("chưa") ? "Không" : "",
        status.includes("da") || status.includes("đã") || status.includes("co") || status.includes("có") ? "Có" : ""
      ]);
      if (match) return make(type === "checkbox" ? [match] : match, 0.92, "trạng thái MCN từ hồ sơ");
    }
    return make(profile.mcnStatus, 0.88, "trạng thái MCN từ hồ sơ");
  }

  if (/livestream|live stream|phat truc tiep|phát trực tiếp/.test(q)) {
    if (["radio", "checkbox", "dropdown"].includes(type) && profile.deliverables) {
      const match = optionMatch(question, [profile.deliverables]);
      if (match && /livestream|live stream|dang ky|đăng ký/.test(q)) {
        return make(type === "checkbox" ? [match] : match, 0.9, "hình thức đăng ký từ hồ sơ");
      }
    }

    if (/gio|giờ|tieng|tiếng|keo dai|kéo dài|duration/.test(q) && profile.livestreamHours) {
      return make(onlyDigits(profile.livestreamHours), 0.9, "thời lượng livestream từ hồ sơ");
    }

    if (/tuan|tuần|daily|lich|lịch|bao nhieu buoi|bao nhiêu buổi/.test(q) && profile.livestreamCadence) {
      return make(profile.livestreamCadence, 0.9, "lịch livestream từ hồ sơ");
    }
  }

  if (/freecast|free cast|khong phi|không phí|mien phi|miễn phí/.test(q) && profile.freecastStatus) {
    if (["radio", "checkbox", "dropdown"].includes(type)) {
      const status = normalizeVi(profile.freecastStatus);
      const match = optionMatch(question, [
        profile.freecastStatus,
        status.includes("khong") || status.includes("không") ? "Không" : "",
        status.includes("co") || status.includes("có") || status.includes("dong y") || status.includes("đồng ý") ? "Có" : ""
      ]);
      if (match) return make(type === "checkbox" ? [match] : match, 0.9, "freecast từ hồ sơ");
    }
    return make(profile.freecastStatus, 0.86, "freecast từ hồ sơ");
  }

  // Low-risk commitment fields. Only choose an explicit positive option; do not type custom promises.
  if (["radio", "checkbox"].includes(type) && /cam ket|cam kết|dong y|đồng ý|xac nhan|xác nhận|chap nhan|chấp nhận|san sang|sẵn sàng|freecast|livestream|review|deadline|quy dinh|quy định/.test(q)) {
    const positive = positiveOption(question);
    if (positive) return make(type === "checkbox" ? [positive] : positive, 0.82, "câu cam kết cần review");
  }

  return null;
}

function repairExistingAnswer(question, existing, fallback) {
  if (!existing) return null;

  const q = normalizeVi(`${question.question} ${question.description || ""}`);
  const normalizedExisting = normalizeAnswerForQuestion(question, existing);
  const answer = normalizedExisting.answer;
  const answerText = Array.isArray(answer) ? answer.join(", ") : String(answer ?? "").trim();
  const fallbackText = Array.isArray(fallback?.answer) ? fallback.answer.join(", ") : String(fallback?.answer ?? "").trim();
  const makeReview = (reason) => ({
    ...normalizedExisting,
    answer: null,
    clearExisting: true,
    confidence: 0,
    needsReview: true,
    reason
  });

  const deterministic = /tiktok|tik tok|facebook|fb|youtube|ytb|email|e-mail|mail|zalo|dien thoai|điện thoại|phone|sdt|sđt|receiver number|recipient number|dia chi|địa chỉ|address|ho ten|họ tên|ten nguoi nhan|tên người nhận|follower|follow|gmv|mcn|upbase|freecast|deadline|timeline|timline|livestream|live stream/.test(q) ||
    isSoldCountQuestion(q) ||
    isProductWantedQuestion(q) ||
    isRateQuestion(q) ||
    isVideoStyleQuestion(q);

  if (fallback && deterministic && normalizeVi(answerText) !== normalizeVi(fallbackText)) {
    return {
      ...normalizedExisting,
      answer: fallback.answer,
      confidence: Math.max(existing.confidence || 0, fallback.confidence),
      needsReview: fallback.needsReview,
      reason: fallback.reason
    };
  }

  if (/sau @|sau/.test(q) && /tiktok|tik tok/.test(q) && typeof answer === "string") {
    return {
      ...normalizedExisting,
      answer: answer.replace(/^@+/, ""),
      confidence: Math.max(existing.confidence || 0, 0.96),
      needsReview: Boolean(existing.needsReview && (existing.confidence || 0) < 0.9)
    };
  }

  const expectsDigits = /follower|follow|gmv|doanh thu|sales|doanh so|doanh số|dien day du so|điền đầy đủ số|chi so|chỉ số/.test(q) || isSoldCountQuestion(q) || isRateQuestion(q);
  if (expectsDigits && !hasDigitsOnly(answerText)) {
    if (fallback) {
      return {
        ...normalizedExisting,
        answer: fallback.answer,
        confidence: Math.max(existing.confidence || 0, fallback.confidence),
        needsReview: fallback.needsReview,
        reason: fallback.reason
      };
    }
    return makeReview("trường này cần số, chưa có dữ liệu chắc chắn");
  }

  if (isProductWantedQuestion(q) && looksLikeUrlOrContact(answerText)) {
    if (fallback) {
      return {
        ...normalizedExisting,
        answer: fallback.answer,
        confidence: fallback.confidence,
        needsReview: fallback.needsReview,
        reason: `${fallback.reason}; cần kiểm tra tên sản phẩm`
      };
    }
    return makeReview("cần tên sản phẩm, không phải link hoặc thông tin liên hệ");
  }

  return normalizedExisting;
}

function normalizeAnswerForQuestion(question, item) {
  if (!item) return item;
  const answer = item.answer;
  if (["radio", "dropdown"].includes(question.type) && Array.isArray(answer)) {
    return { ...item, answer: answer[0] ?? null };
  }
  if (question.type === "checkbox" && answer != null && !Array.isArray(answer)) {
    return { ...item, answer: [answer] };
  }
  return item;
}

function invalidPrefillReason(question) {
  const q = normalizeVi(`${question.question} ${question.description || ""}`);
  const value = Array.isArray(question.currentValue) ? question.currentValue.join(", ") : String(question.currentValue ?? "").trim();
  if (!value) return "";

  const expectsDigits = /follower|follow|gmv|doanh thu|sales|doanh so|doanh số|dien day du so|điền đầy đủ số|chi so|chỉ số/.test(q) || isSoldCountQuestion(q) || isRateQuestion(q);
  if (expectsDigits && !hasDigitsOnly(value)) return "giá trị có sẵn không đúng kiểu số";
  if (isProductWantedQuestion(q) && looksLikeUrlOrContact(value)) return "giá trị có sẵn không phải tên sản phẩm";
  return "";
}

function mergeProfileFallbacks(payload, form, settings) {
  const profile = settings.profile || {};
  const byId = new Map((payload.answers || []).map((item) => [item.questionId, item]));
  const answers = [];

  for (const question of form.questions || []) {
    const existing = byId.get(question.id);
    const existingHasAnswer = existing && existing.answer != null && existing.answer !== "" && !(Array.isArray(existing.answer) && !existing.answer.length);
    const fallback = answerFromProfile(question, profile, form);

    if (existingHasAnswer) {
      answers.push(repairExistingAnswer(question, existing, fallback));
      continue;
    }

    if (fallback) {
      answers.push({
        questionId: question.id,
        answer: fallback.answer,
        confidence: fallback.confidence,
        needsReview: fallback.needsReview,
        reason: fallback.reason
      });
    } else if (invalidPrefillReason(question)) {
      answers.push({
        questionId: question.id,
        answer: null,
        clearExisting: true,
        confidence: 0,
        needsReview: true,
        reason: invalidPrefillReason(question)
      });
    } else if (existing) {
      answers.push(existing);
    } else {
      answers.push({
        questionId: question.id,
        answer: null,
        confidence: 0,
        needsReview: true,
        reason: "thiếu thông tin trong profile/context"
      });
    }
  }

  const filledCount = answers.filter((item) => item.answer != null && item.answer !== "" && !(Array.isArray(item.answer) && !item.answer.length)).length;
  return {
    summary: payload.summary || `Đã tạo nháp ${filledCount}/${(form.questions || []).length} câu từ AI + profile.`,
    answers
  };
}

function buildPrompt({ form, settings }) {
  const enabledContexts = (settings.contexts || [])
    .filter((item) => item.enabled && item.body?.trim())
    .map((item) => `# ${item.title}\n${item.body.trim()}`)
    .join("\n\n");

  const profileText = compactProfile(settings.profile);

  return `You are LocalForm AI, a private local assistant that helps a user fill Google Forms.

You MUST return only strict JSON. No markdown. No comments.

Core safety rules:
- Do not submit the form.
- Do not invent personal data, metrics, prices, addresses, phone numbers, emails, IDs, GMV, followers, or sales numbers.
- If a required personal value is missing, return null with needsReview=true.
- Do not skip unrelated fields just because one metric is below a requirement; fill factual fields that are available and mark risky fields for review.
- Some questions include currentValue from a prefilled form link. Keep it only if it clearly matches the question; correct or null obvious mismatches.
- If a TikTok ID question says "sau @", return the handle without the @ symbol.
- If a TikTok link is missing but a TikTok handle exists, derive https://www.tiktok.com/@handle.
- Never put video style text in count fields such as "Số sản phẩm bán được"; those require digits only.
- Never put TikTok/profile links in product sample fields such as "Sản phẩm bạn muốn nhận"; use the saved product preference or campaign product name.
- Never put usernames, handles, emails, links, or descriptive text in rate/price fields; rates require digits only from the saved rate card.
- For video style radio questions, use the saved videoStyle and choose the closest option. If no option matches, return the saved style text for Other.
- For radio/select questions, choose exactly one of the provided options.
- For checkbox questions, return an array of options from the provided choices.
- For text questions that say "chỉ số", "điền số", "không điền chữ", return digits only, no commas, no dots, no unit.
- Keep Vietnamese answers natural and short.
- Avoid overly polished marketing language.
- For yes/no commitment questions, answer positively only if it does not conflict with profile/context.
- For KOC/KOL forms, prefer profile facts over generic copy.

User profile:
${profileText || "No profile provided."}

Custom context:
${enabledContexts || "No custom context provided."}

Google Form:
${JSON.stringify(form, null, 2)}

Return this exact JSON shape:
{
  "summary": "short Vietnamese summary of how you filled the form",
  "answers": [
    {
      "questionId": "same id from input",
      "answer": "string | string[] | null",
      "confidence": 0.0,
      "needsReview": true,
      "reason": "very short Vietnamese reason"
    }
  ]
}`;
}

function extractModelText(data) {
  const content = data?.message?.content ?? data?.response ?? data?.content ?? "";
  if (String(content || "").trim()) return String(content);

  const thinking = data?.message?.thinking ?? data?.thinking ?? "";
  const model = data?.model ? ` model=${data.model}` : "";
  const doneReason = data?.done_reason ? ` done_reason=${data.done_reason}` : "";
  const hasThinking = String(thinking || "").trim() ? " Model returned thinking text but no final content." : "";
  throw new Error(`Empty model response.${model}${doneReason}.${hasThinking} Try enabling think=false or using a non-thinking model.`);
}

function extractJson(text) {
  if (!text) throw new Error("Empty model response");
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) throw new Error("Model did not return JSON");
    return JSON.parse(trimmed.slice(first, last + 1));
  }
}

function validateAnswers(payload, form) {
  const questionIds = new Set((form.questions || []).map((q) => q.id));
  const answers = Array.isArray(payload.answers) ? payload.answers : [];
  return {
    summary: String(payload.summary || "Đã tạo câu trả lời nháp."),
    answers: answers
      .filter((item) => questionIds.has(item.questionId))
      .map((item) => ({
        questionId: item.questionId,
        answer: item.answer ?? null,
        confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0))),
        needsReview: Boolean(item.needsReview ?? true),
        reason: String(item.reason || "")
      }))
  };
}

async function postOllamaChatDirect(endpoint, body) {
  const res = await fetch(`${endpoint}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    const error = new Error(`Ollama error ${res.status}: ${message.slice(0, 180)}`);
    error.status = res.status;
    throw error;
  }

  return res.json();
}

async function postOllamaChat(settings, body) {
  const endpoint = normalizeEndpoint(settings.endpoint);

  try {
    return await postOllamaChatDirect(endpoint, body);
  } catch (directError) {
    // Ollama rejects chrome-extension:// origins unless OLLAMA_ORIGINS is configured.
    // When the local companion is installed, proxy through native messaging to avoid
    // browser CORS/origin issues while still keeping all data on the user's machine.
    const shouldProxy = isLoopbackEndpoint(endpoint) && (
      directError.status === 403 ||
      /403|Forbidden|Failed to fetch|Load failed|network/i.test(directError.message || "")
    );

    if (!shouldProxy) throw directError;

    try {
      const proxied = await nativeRequest("ollama_chat", {
        endpoint,
        body,
        timeoutMs: 120000,
        nativeHostName: settings.nativeHostName || NATIVE_HOST_NAME
      });
      return proxied.data;
    } catch (nativeError) {
      throw new Error(
        `${directError.message}. Native proxy also failed: ${nativeError.message || nativeError}`
      );
    }
  }
}

async function requestModelAnswers(form, settings) {
  const prompt = buildPrompt({ form, settings });
  const requestBody = {
    model: settings.model,
    stream: false,
    think: false,
    format: "json",
    options: {
      temperature: Number(settings.temperature ?? 0.2),
      num_predict: 2048
    },
    messages: [
      {
        role: "system",
        content: "You output final answers only. Do not think out loud. Return strict JSON only."
      },
      {
        role: "user",
        content: `/nothink\n${prompt}`
      }
    ]
  };

  let data = await postOllamaChat(settings, requestBody);

  try {
    const parsed = extractJson(extractModelText(data));
    return validateAnswers(parsed, form);
  } catch (firstError) {
    // Some small/local models behave badly with Ollama JSON mode. Retry once
    // without `format: "json"` while keeping think=false and a strict prompt.
    const retryBody = {
      ...requestBody,
      format: undefined,
      messages: [
        requestBody.messages[0],
        {
          role: "user",
          content: `/nothink\nReturn only one valid JSON object. No markdown. No code fence.\n\n${prompt}`
        }
      ]
    };
    delete retryBody.format;
    data = await postOllamaChat(settings, retryBody);

    try {
      const parsed = extractJson(extractModelText(data));
      return validateAnswers(parsed, form);
    } catch (retryError) {
      throw new Error(`${firstError.message} Retry also failed: ${retryError.message}`);
    }
  }
}

async function generateAnswersInChunks(form, settings, chunkSize = 6) {
  const questions = form.questions || [];
  const answers = [];
  const errors = [];

  for (let i = 0; i < questions.length; i += chunkSize) {
    const chunkForm = {
      ...form,
      questions: questions.slice(i, i + chunkSize)
    };

    try {
      const payload = await requestModelAnswers(chunkForm, settings);
      answers.push(...(payload.answers || []));
    } catch (error) {
      errors.push(`chunk ${Math.floor(i / chunkSize) + 1}: ${error.message || error}`);
    }
  }

  return {
    summary: errors.length
      ? `Đã tạo nháp theo từng phần; ${errors.length} phần cần fallback profile.`
      : "Đã tạo nháp theo từng phần.",
    answers
  };
}

async function generateAnswers(form) {
  const settings = await getSettings();
  await ensureOllama(settings);

  try {
    const payload = await requestModelAnswers(form, settings);
    return mergeProfileFallbacks(payload, form, settings);
  } catch (error) {
    if ((form.questions || []).length <= 6) throw error;
    const chunked = await generateAnswersInChunks(form, settings);
    return mergeProfileFallbacks(chunked, form, settings);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(["settings"]);
  if (!current.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "GET_SETTINGS") {
      sendResponse({ ok: true, settings: await getSettings() });
      return;
    }

    if (message?.type === "SAVE_SETTINGS") {
      const merged = deepMerge(await getSettings(), message.settings || {});
      await chrome.storage.local.set({ settings: merged });
      sendResponse({ ok: true, settings: merged });
      return;
    }

    if (message?.type === "PING_OLLAMA") {
      const settings = await getSettings();
      const result = await ensureOllama(settings, { forceStart: Boolean(message.forceStart) });
      sendResponse({ ok: true, result });
      return;
    }

    if (message?.type === "START_OLLAMA") {
      const settings = await getSettings();
      const result = await ensureOllama(settings, { forceStart: true });
      sendResponse({ ok: true, result });
      return;
    }

    if (message?.type === "NATIVE_STATUS") {
      const settings = await getSettings();
      const result = await nativeRequest("status", {
        endpoint: normalizeEndpoint(settings.endpoint),
        nativeHostName: settings.nativeHostName || NATIVE_HOST_NAME
      });
      sendResponse({ ok: true, result });
      return;
    }

    if (message?.type === "GENERATE_ANSWERS") {
      const result = await generateAnswers(message.form);
      sendResponse({ ok: true, result });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || String(error) });
  });

  return true;
});
