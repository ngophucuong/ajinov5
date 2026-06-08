const axios = require("axios");
const { telegramify } = require("telegramify-markdown");
const { parseVietnameseTime } = require("./timeparser");

const AGNO_URL = process.env.AGNO_API_URL || "http://agno:8000";
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function escapeMd(text) {
  return (text || "").replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
function formatForTg(md) {
  try {
    const c = telegramify(md || "");
    return c.length > 4000 ? c.substring(0, 4000) + "\n\n_[tiếp tục...]_" : c;
  } catch {
    return (md || "").substring(0, 4000);
  }
}
function formatVN(d) {
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function vnNow() {
  // Return current Vietnam time as timestamp offset from UTC
  const utc = Date.now();
  return utc + 7 * 3600000; // UTC+7 in ms
}
function vnHour(d) {
  // Get Vietnam hour from a UTC Date or ISO string
  const utc = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  return Math.floor(((utc + 7 * 3600000) % 86400000) / 3600000);
}
function makeVNISO(hour, minute, dayOffset) {
  // Create ISO string from Vietnam time components
  const nowVN = vnNow();
  const d = new Date(nowVN);
  d.setUTCHours(hour - 7, minute || 0, 0, 0); // Convert VN hour to UTC
  if (dayOffset) d.setUTCDate(d.getUTCDate() + dayOffset);
  // If time already passed today, push to tomorrow
  if (d.getTime() <= Date.now()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

async function sendMsg(chatId, text, extra = {}) {
  return axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    { chat_id: chatId, text, parse_mode: "Markdown", ...extra },
  );
}
async function editMsg(chatId, msgId, text, extra = {}) {
  return axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`,
    {
      chat_id: chatId,
      message_id: msgId,
      text,
      parse_mode: "Markdown",
      ...extra,
    },
  );
}
async function answerCb(cbId, text) {
  return axios
    .post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
      callback_query_id: cbId,
      text,
    })
    .catch(() => {});
}

async function handleChat(tid, text, complexity = "fast") {
  const label =
    complexity === "deep" ? "◉ *Đang phân tích...*" : "⚡ *Đang tra cứu...*";
  const waitMsg = await sendMsg(tid, label);
  const msgId = waitMsg.data?.result?.message_id;
  try {
    const res = await axios.post(`${AGNO_URL}/chat`, {
      message: text,
      reasoning_mode: complexity,
      user_id: String(tid),
    });
    const d = res.data?.data || {};
    const content = formatForTg(d.response || "");
    const header = `${complexity === "deep" ? "◉ Deep" : "⚡ Fast"} · ${d.model_used || "?"} · ${((d.latency_ms || 0) / 1000).toFixed(1)}s`;
    if (msgId)
      await editMsg(tid, msgId, `${header}\n\n${content}`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🔖 Lưu", callback_data: "mem_save" },
              { text: "🔄 Tiếp", callback_data: "followup" },
            ],
          ],
        },
      });
  } catch (e) {
    if (msgId) await editMsg(tid, msgId, "⚠️ Lỗi.");
  }
}

async function handleCallback(cb) {
  const { id, from, data } = cb;
  const tid = from.id;
  if (!data) return answerCb(id);
  const [action, ...parts] = data.split(":");

  if (action === "mem_approve") {
    await answerCb(id, "✅");
    const [mid, off] = parts;
    await axios.patch(`${AGNO_URL}/memory/${mid}`, { status: "canonical" });
    const r = await axios.get(
      `${AGNO_URL}/memory?status=pending&limit=1&offset=${parseInt(off) + 1}`,
    );
    await showNext(tid, r, parseInt(off) + 1);
  } else if (action === "mem_reject") {
    await answerCb(id, "❌");
    const [mid, off] = parts;
    await axios.patch(`${AGNO_URL}/memory/${mid}`, { status: "archived" });
    const r = await axios.get(
      `${AGNO_URL}/memory?status=pending&limit=1&offset=${parseInt(off)}`,
    );
    await showNext(tid, r, parseInt(off));
  } else if (action === "mem_skip") {
    const off = parseInt(parts[0]);
    const r = await axios.get(
      `${AGNO_URL}/memory?status=pending&limit=1&offset=${off}`,
    );
    await showNext(tid, r, off);
  } else if (action === "cap_commit") {
    try {
      await axios.post(`${AGNO_URL}/capture/${parts[0]}/commit`, {
        user_id: String(tid),
      });
      await answerCb(id, "✅");
    } catch {
      await answerCb(id, "⚠️");
    }
  } else if (action === "cap_discard") {
    await answerCb(id, "❌");
  } else if (action === "remind_am" || action === "remind_pm") {
    const hour = parseInt(parts[0]);
    const rawText = parts.slice(1).join(":").replace(/\|/g, ":");
    const isPM = action === "remind_pm";
    const th = isPM ? (hour === 12 ? 12 : hour + 12) : hour;
    const td = vnNow();
    td.setHours(th, 0, 0, 0);
    if (td <= vnNow()) td.setDate(td.getDate() + 1);
    const content = rawText.replace(/nhắc\s+tôi\s+/i, "").trim() || rawText;
    await axios.post(`${AGNO_URL}/reminders`, {
      content,
      remind_at: td.toISOString(),
      telegram_id: String(tid),
      user_id: String(tid),
    });
    await answerCb(id, `✅ ${isPM ? "Tối" : "Sáng"} ${hour}h`);
    await sendMsg(
      tid,
      `✅ *Đã đặt nhắc nhở*\n\n📌 ${escapeMd(content)}\n🕐 ${formatVN(td)}`,
    );
  } else {
    await answerCb(id);
  }
}
async function showNext(tid, res, off) {
  if (res.data?.data?.length) {
    const item = res.data.data[0];
    await sendMsg(
      tid,
      `🧠 *Memory Review*\n\n${escapeMd((item.content || "").substring(0, 500))}\n\n_${(item.created_at || "").substring(0, 10)}_`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Duyệt",
                callback_data: `mem_approve:${item.id}:${off}`,
              },
              { text: "❌ Bỏ", callback_data: `mem_reject:${item.id}:${off}` },
            ],
            [{ text: "⏭ Bỏ qua", callback_data: `mem_skip:${off + 1}` }],
          ],
        },
      },
    );
  } else {
    await sendMsg(tid, "✓ Hết memory cần duyệt.");
  }
}

async function handleCapture(tid, content) {
  const waitMsg = await sendMsg(tid, "📌 *Đang trích xuất...*");
  const msgId = waitMsg.data?.result?.message_id;
  try {
    const res = await axios.post(`${AGNO_URL}/capture`, {
      type: "text",
      content,
      user_id: String(tid),
    });
    const cid = res.data?.data?.id;
    let facts = null;
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const c = await axios.get(`${AGNO_URL}/capture/${cid}`);
      if (c.data?.data?.status === "extracted") {
        facts = JSON.parse(c.data.data.extracted_facts || "[]");
        break;
      }
    }
    if (facts?.length) {
      const fl = facts
        .map((f, i) => `${i + 1}\\. ${escapeMd(f.fact)}`)
        .join("\n");
      if (msgId)
        await editMsg(tid, msgId, `📌 *Facts:*\n\n${fl}`, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Gửi vào Memory",
                  callback_data: `cap_commit:${cid}`,
                },
                { text: "❌ Bỏ", callback_data: `cap_discard:${cid}` },
              ],
            ],
          },
        });
    } else {
      if (msgId) await editMsg(tid, msgId, "Không tìm thấy facts.");
    }
  } catch (e) {
    if (msgId) await editMsg(tid, msgId, "⚠️ Lỗi.");
  }
}

// ─── Remind handler v2 — context-aware + heuristic + LLM fallback ──
async function handleRemind(tid, text) {
  const waitMsg = await sendMsg(tid, "⏰ *Đang phân tích...*");
  const msgId = waitMsg.data?.result?.message_id;

  try {
    let isoStr = null;
    const parsed = parseVietnameseTime(text, vnNow());

    if (parsed && parsed.iso) {
      // Step 1: Heuristic resolved it
      isoStr = parsed.iso;
    } else if (parsed && parsed.ambiguous) {
      // Step 2: Ambiguous — check context or ask
      try {
        const recentCheck = await axios.get(`${AGNO_URL}/reminders/pending`);
        const myRecent = (recentCheck.data?.data || []).filter(
          (r) => r.telegram_id == tid,
        );
        if (myRecent.length > 0) {
          const lastHour = vnHour(myRecent[0].remind_at); // Vietnam hour
          isoStr = makeVNISO(lastHour < 12 ? parsed.hour : parsed.hour + 12);
        }
      } catch {}

      if (!isoStr) {
        // Ask user: Sáng or Tối?
        if (msgId)
          await editMsg(
            tid,
            msgId,
            `⏰ *${parsed.hour}h — Sáng hay Tối?*\n\n_${escapeMd(text)}_`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "☀️ Sáng (AM)",
                      callback_data: `remind_am:${parsed.hour}:${text.replace(/:/g, "|")}`,
                    },
                    {
                      text: "🌙 Tối (PM)",
                      callback_data: `remind_pm:${parsed.hour}:${text.replace(/:/g, "|")}`,
                    },
                  ],
                ],
              },
            },
          );
        return;
      }
    }

    // Step 3: LLM fallback
    if (!isoStr) {
      const LITELLM_URL = process.env.LITELLM_URL || "http://litellm:4000";
      const LITELLM_KEY =
        process.env.LITELLM_MASTER_KEY || "sk-ajinov5-litellm-master-2026";
      const parseRes = await axios.post(
        `${LITELLM_URL}/chat/completions`,
        {
          model: "deepseek-flash",
          max_tokens: 2000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: `Current Vietnam time: ${formatVN(vnNow())}. Parse reminder: "${text}". Return ONLY ISO 8601 UTC.`,
            },
          ],
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LITELLM_KEY}`,
          },
          timeout: 15000,
        },
      );
      const msg = parseRes.data?.choices?.[0]?.message;
      const full = (msg?.content || "") + " " + (msg?.reasoning_content || "");
      const m = full.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*)/);
      if (m) isoStr = m[1];
    }

    const remindAt = isoStr ? new Date(isoStr) : null;
    if (!remindAt || isNaN(remindAt.getTime()) || remindAt <= vnNow()) {
      if (msgId)
        await editMsg(
          tid,
          msgId,
          '⚠️ Không rõ thời gian. Thử: "8h sáng mai gặp Hải"',
        );
      return;
    }

    const content =
      text
        .replace(/nhắc\s+tôi\s+/i, "")
        .replace(/lúc\s+.*$/i, "")
        .trim() || text;
    await axios.post(`${AGNO_URL}/reminders`, {
      content,
      remind_at: isoStr,
      telegram_id: String(tid),
      user_id: String(tid),
    });
    if (msgId)
      await editMsg(
        tid,
        msgId,
        `✅ *Đã đặt nhắc nhở*\n\n📌 ${escapeMd(content)}\n🕐 ${formatVN(remindAt)}`,
      );
  } catch (e) {
    if (msgId) await editMsg(tid, msgId, "⚠️ Lỗi tạo nhắc nhở.");
  }
}

module.exports = {
  handleChat,
  handleCallback,
  handleCapture,
  handleRemind,
  sendMsg,
  editMsg,
  answerCb,
  escapeMd,
};
