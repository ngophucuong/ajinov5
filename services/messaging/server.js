const express = require("express");
const axios = require("axios");
const { telegramify } = require("telegramify-markdown");

const app = express();
app.use(express.json());

const AGNO_URL = process.env.AGNO_API_URL || "http://agno:8000";
const LITELLM_URL = process.env.LITELLM_URL || "http://litellm:4000";
const LITELLM_KEY =
  process.env.LITELLM_MASTER_KEY || "sk-ajinov5-litellm-master-2026";
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WORKER_URL =
  process.env.WORKER_URL || "https://agent-gateway.ngophucuong.workers.dev";
const INTERNAL_SECRET =
  process.env.INTERNAL_SECRET || "dev-secret-change-in-production";
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "whsec-dev";

// Import handlers
const { classifyIntent } = require("./intent");
const { getState, setState, clearState } = require("./state");
const { startCronJobs } = require("./cron");
const {
  handleChat,
  handleCallback,
  handleCapture,
  handleCapCommit,
  handleRemind,
} = require("./handlers");

// ─── Health ──────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "messaging-gateway-v5",
    telegram: TELEGRAM_TOKEN ? "configured" : "missing",
  });
});

// ─── Validate Telegram webhook secret ─────────────────────
function validateSecret(req, res, next) {
  // Only validate if WEBHOOK_SECRET is set to a non-default value
  if (
    !WEBHOOK_SECRET ||
    WEBHOOK_SECRET === "whsec-dev" ||
    WEBHOOK_SECRET === "whsec-ajinov5-dev"
  ) {
    return next();
  }
  const secret = req.headers["x-telegram-bot-api-secret-token"];
  if (secret !== WEBHOOK_SECRET) {
    return res.status(403).end();
  }
  next();
}

// ─── Main webhook ────────────────────────────────────────
app.post("/telegram/webhook", validateSecret, async (req, res) => {
  res.sendStatus(200); // Respond immediately to Telegram
  console.log("Webhook received:", JSON.stringify(req.body).substring(0, 100));

  const body = req.body;
  try {
    if (body.callback_query) {
      await handleCallback(body.callback_query);
    } else if (body.message?.text) {
      await handleMessage(body.message);
    }
  } catch (err) {
    console.error("Webhook error:", err.message);
  }
});

// ─── Message router ──────────────────────────────────────
async function handleMessage(message) {
  const { from, text, chat } = message;
  const tid = from.id;

  // Slash commands
  if (text === "/start") return sendStart(tid, from.first_name);
  if (text === "/mem") return handleMemoryReview(tid);
  if (text === "/cancel") {
    await clearState(tid);
    return sendMsg(tid, "✗ Đã huỷ.");
  }
  if (text.startsWith("/ask ")) return handleChat(tid, text.slice(5), "deep");
  if (text.startsWith("/quick ")) return handleChat(tid, text.slice(7), "fast");
  if (text.startsWith("/cap ")) return handleCapture(tid, text.slice(5));

  // Check if user is in a state flow
  const state = await getState(tid);
  if (state) return continueFlow(tid, text, state);

  // Intent classification via LiteLLM
  const intent = await classifyIntent(text);

  switch (intent.intent) {
    case "QUERY":
    case "UNKNOWN":
      return handleChat(tid, text, intent.complexity || "fast");
    case "CAPTURE":
      return handleCapture(tid, intent.params?.content || text);
    case "REMIND":
      return handleRemind(tid, text);
    case "MEMORY_REVIEW":
      return handleMemoryReview(tid);
    default:
      return handleChat(tid, text, "fast");
  }
}

// ─── State continuation ──────────────────────────────────
async function continueFlow(tid, text, state) {
  if (state.flow === "capture_detail") {
    // User is providing additional capture content
    await clearState(tid);
    return handleCapture(tid, text);
  }
  // Default: clear state and treat as chat
  await clearState(tid);
  return handleChat(tid, text, "fast");
}

// ─── Memory Review handler ───────────────────────────────
async function handleMemoryReview(tid, offset = 0) {
  try {
    const res = await axios.get(
      `${AGNO_URL}/memory?status=pending&limit=1&offset=${offset}`,
    );
    const items = res.data?.data || [];

    if (!items.length) {
      return sendMsg(tid, "✓ Không còn memory nào cần duyệt.");
    }

    const item = items[0];
    const contentPreview = escapeMd((item.content || "").substring(0, 500));
    const dateStr = (item.created_at || "").substring(0, 10);

    await sendMsg(
      tid,
      `🧠 *Memory Review*\n\n${contentPreview}\n\n_${dateStr}_`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Duyệt",
                callback_data: `mem_approve:${item.id}:${offset}`,
              },
              {
                text: "❌ Bỏ",
                callback_data: `mem_reject:${item.id}:${offset}`,
              },
            ],
            [{ text: "⏭ Bỏ qua", callback_data: `mem_skip:${offset + 1}` }],
          ],
        },
      },
    );
  } catch (e) {
    console.error("handleMemoryReview error:", e.message);
    return sendMsg(tid, "⚠️ Lỗi khi tải memory.");
  }
}

// ─── /start handler ──────────────────────────────────────
async function sendStart(tid, name) {
  const n = escapeMd(name || "bạn");
  await sendMsg(
    tid,
    `🤖 *Ajino v5* — Trợ lý AI của ${n}

*Lệnh:*
/ask \\<câu hỏi\\> — Hỏi sâu, phân tích
/quick \\<câu hỏi\\> — Hỏi nhanh
/cap \\<nội dung\\> — Ghi chú fact
/mem — Duyệt Memory

Hoặc cứ nhắn tự nhiên, tôi sẽ hiểu.`,
  );
}

// ─── Telegram helpers ────────────────────────────────────
async function sendMsg(chatId, text, extra = {}) {
  return axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      ...extra,
    },
  );
}

function escapeMd(text) {
  return (text || "").replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

// ─── Start cron jobs ─────────────────────────────────────
startCronJobs();

// ─── Start server ────────────────────────────────────────
app.listen(3000, "0.0.0.0", () => console.log("Messaging Gateway v5 on :3000"));
