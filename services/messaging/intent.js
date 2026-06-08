const axios = require("axios");

const SYSTEM_PROMPT = `Bạn là intent classifier cho Ajino v5. Trả về JSON ONLY, không markdown, không giải thích.

Schema: {"intent":"QUERY"|"CAPTURE"|"REMIND"|"MEMORY_REVIEW"|"OPS"|"UNKNOWN","complexity":"fast"|"deep","params":{}}

Rules:
- QUERY = câu hỏi, phân tích, tìm kiếm, hỏi đáp thông thường
- CAPTURE = ghi lại fact mới, kết quả meeting, thông tin cần lưu
- REMIND = nhắc nhở, đặt lịch, hoặc câu có mốc thời gian cụ thể (lúc, chiều, sáng, tối, mai, hôm nay, giờ, thứ) — kể cả khi không có từ "nhắc"
- MEMORY_REVIEW = xem hoặc duyệt memory
- OPS = thao tác hệ thống (kiểm tra trạng thái, etc.)
- UNKNOWN = không rõ ý định

Complexity:
- "deep" nếu có phân tích, so sánh, chiến lược, tại sao, rủi ro, dự báo, xu hướng
- "fast" cho còn lại`;

async function classifyIntent(text) {
  const url = process.env.LITELLM_URL || "http://litellm:4000";
  const key =
    process.env.LITELLM_MASTER_KEY || "sk-ajinov5-litellm-master-2026";

  const race = Promise.race([
    axios.post(
      `${url}/chat/completions`,
      {
        model: "deepseek-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        max_tokens: 800,
        temperature: 0,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        timeout: 3000,
      },
    ),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 8000),
    ),
  ]);

  try {
    const res = await race;
    const msg = res.data.choices[0].message;
    // DeepSeek v4 may return reasoning_content instead of content
    const raw =
      msg.content ||
      msg.reasoning_content ||
      msg.provider_specific_fields?.reasoning_content ||
      "";
    if (!raw || !raw.trim()) throw new Error("empty_content");
    const json = raw.match(/\{[\s\S]*\}/)?.[0] || "{}";
    const parsed = JSON.parse(json);
    return {
      intent: parsed.intent || "UNKNOWN",
      complexity: parsed.complexity || "fast",
      params: parsed.params || {},
    };
  } catch (e) {
    // Fallback: heuristic classification
    const t = text.toLowerCase();
    if (/nhắc|remind|lịch|schedule/.test(t))
      return { intent: "REMIND", complexity: "fast", params: {} };
    if (/duyệt memory|review memory|xem memory|memory review/.test(t))
      return { intent: "MEMORY_REVIEW", complexity: "fast", params: {} };
    if (/ghi|lưu|fact|capture|note/.test(t) && text.length < 200)
      return {
        intent: "CAPTURE",
        complexity: "fast",
        params: { content: text },
      };
    return { intent: "QUERY", complexity: "fast", params: {} };
  }
}

module.exports = { classifyIntent };
