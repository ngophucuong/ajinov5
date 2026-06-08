/**
 * Ajino v5 — Cloudflare Worker (agent-gateway)
 * Auth JWT verification, rate limit, thin routing to VPS via Tunnel
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { SignJWT } from "jose";
import type { Context } from "hono";

// ─── CONFIG ────────────────────────────────────────────
const CONFIG = {
  OTP_TTL: 300, // 5 minutes
  RATE_LIMIT_WINDOW: 60, // 1 minute window
  RATE_LIMIT_MAX: 100, // max requests per window
  TUNNEL_BASE: "https://api.ajinov5.cuong.ngo", // Worker on Edge → Tunnel → VPS Agno
};

// ─── BINDINGS TYPE ─────────────────────────────────────
type Bindings = {
  OTP_KV: KVNamespace;
  RATE_LIMIT_KV: KVNamespace;
  VECTORIZE_INDEX: VectorizeIndex;
  R2_STORAGE: R2Bucket;
  R2_BACKUPS: R2Bucket;
  AI: { run: (model: string, input: unknown) => Promise<{ data: number[][] }> };
  JWT_SECRET: string;
  TELEGRAM_BOT_TOKEN: string;
};

// ─── HELPERS ───────────────────────────────────────────
function generateOTP(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  const num =
    ((buf[0]! << 24) | (buf[1]! << 16) | (buf[2]! << 8) | buf[3]!) >>> 0;
  return String((num % 900000) + 100000).padStart(6, "0");
}

async function createJWT(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(new TextEncoder().encode(secret));
}

// ─── TELEGRAM ─────────────────────────────────────────
async function sendTelegramMessage(
  token: string,
  chatId: number,
  text: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
      },
    );
    const data = (await res.json()) as { ok: boolean };
    return data.ok === true;
  } catch (err) {
    console.error("Telegram send failed:", err);
    return false;
  }
}

// Get secret bytes for verification
function getSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

// ─── RATE LIMIT ────────────────────────────────────────
async function checkRateLimit(
  env: Bindings,
  key: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const windowKey = `rl:${key}:${Math.floor(Date.now() / 1000 / CONFIG.RATE_LIMIT_WINDOW)}`;
  const count = parseInt((await env.RATE_LIMIT_KV.get(windowKey)) || "0", 10);

  if (count >= CONFIG.RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  await env.RATE_LIMIT_KV.put(windowKey, String(count + 1), {
    expirationTtl: CONFIG.RATE_LIMIT_WINDOW + 10,
  });

  return { allowed: true, remaining: CONFIG.RATE_LIMIT_MAX - count - 1 };
}

// ─── PROXY TO VPS ──────────────────────────────────────
async function proxyToVPS(
  request: Request,
  path: string,
  additionalHeaders: Record<string, string> = {},
): Promise<Response> {
  const url = new URL(request.url);
  const target = `${CONFIG.TUNNEL_BASE}${path}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set(
    "X-Forwarded-For",
    request.headers.get("CF-Connecting-IP") || "unknown",
  );
  headers.set("X-Request-ID", crypto.randomUUID());
  Object.entries(additionalHeaders).forEach(([k, v]) => headers.set(k, v));

  try {
    return await fetch(target, {
      method: request.method,
      headers,
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? await request.clone().arrayBuffer()
          : undefined,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        data: null,
        error: { code: "SVC_001", message: "SERVICE_UNAVAILABLE" },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
}

// ─── APP ───────────────────────────────────────────────
const app = new Hono<{ Bindings: Bindings }>();

// CORS
app.use(
  "*",
  cors({
    origin: ["https://ajinov5.cuong.ngo"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// ─── PUBLIC ROUTES ─────────────────────────────────────

// Health check
app.get("/health", (c: Context<{ Bindings: Bindings }>) => {
  return c.json({ status: "ok", service: "agent-gateway", version: "5.0.0" });
});

// Auth: Request OTP
app.post("/auth/otp/request", async (c: Context<{ Bindings: Bindings }>) => {
  const { telegram_id } = await c.req.json<{ telegram_id: number }>();

  if (!telegram_id) {
    return c.json(
      {
        data: null,
        error: { code: "AUTH_001", message: "Missing telegram_id" },
      },
      400,
    );
  }

  // Rate limit: max 3 OTP requests per 5 min
  const rateKey = `otp-rl:${telegram_id}`;
  const fiveMinKey = `${rateKey}:${Math.floor(Date.now() / 1000 / 300)}`;
  const reqCount = parseInt(
    (await c.env.RATE_LIMIT_KV.get(fiveMinKey)) || "0",
    10,
  );

  if (reqCount >= 3) {
    return c.json(
      { data: null, error: { code: "AUTH_003", message: "OTP_RATE_LIMITED" } },
      429,
    );
  }

  await c.env.RATE_LIMIT_KV.put(fiveMinKey, String(reqCount + 1), {
    expirationTtl: 310,
  });

  // Generate & store OTP
  const otp = generateOTP();
  await c.env.OTP_KV.put(
    `otp:${telegram_id}`,
    JSON.stringify({
      otp,
      user_id: null,
      expires_at: new Date(Date.now() + CONFIG.OTP_TTL * 1000).toISOString(),
    }),
    { expirationTtl: CONFIG.OTP_TTL },
  );

  // Send OTP via Telegram
  const sent = await sendTelegramMessage(
    c.env.TELEGRAM_BOT_TOKEN,
    telegram_id,
    `<b>🔐 Ajino v5</b>\n\nMã xác thực của bạn: <code>${otp}</code>\n\nMã hết hạn sau 5 phút.`,
  );

  if (!sent) {
    console.warn(`Failed to send OTP to ${telegram_id}`);
  }

  return c.json({ data: { expires_in: CONFIG.OTP_TTL } });
});

// Auth: Verify OTP → Issue JWT
app.post("/auth/otp/verify", async (c: Context<{ Bindings: Bindings }>) => {
  const { telegram_id, otp } = await c.req.json<{
    telegram_id: number;
    otp: string;
  }>();

  if (!telegram_id || !otp) {
    return c.json(
      { data: null, error: { code: "AUTH_001", message: "OTP_INVALID" } },
      401,
    );
  }

  const stored = await c.env.OTP_KV.get(`otp:${telegram_id}`);
  if (!stored) {
    return c.json(
      { data: null, error: { code: "AUTH_002", message: "OTP_EXPIRED" } },
      401,
    );
  }

  const { otp: storedOTP } = JSON.parse(stored) as { otp: string };
  if (storedOTP !== otp) {
    return c.json(
      { data: null, error: { code: "AUTH_001", message: "OTP_INVALID" } },
      401,
    );
  }

  // Delete used OTP
  await c.env.OTP_KV.delete(`otp:${telegram_id}`);

  // Issue JWT
  const token = await createJWT(
    { sub: String(telegram_id), role: "ceo", telegram_id },
    c.env.JWT_SECRET,
  );

  // Set httpOnly cookie
  c.header(
    "Set-Cookie",
    `ajino_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`,
  );

  return c.json({
    data: { token, user: { id: null, telegram_id, role: "ceo" } },
  });
});

// Auth: Logout
app.post("/auth/logout", (c: Context<{ Bindings: Bindings }>) => {
  c.header(
    "Set-Cookie",
    "ajino_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
  );
  return c.json({ data: null });
});

// ─── PROTECTED ROUTES (JWT required) ───────────────────
// Accept JWT from Authorization header OR cookie
app.use("/api/*", async (c, next) => {
  let token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    const cookie = c.req.header("Cookie") || "";
    const match = cookie.match(/ajino_token=([^;]+)/);
    token = match ? match[1] : null;
  }
  if (!token) {
    return c.json(
      { data: null, error: { code: "AUTH_004", message: "JWT_INVALID" } },
      401,
    );
  }

  try {
    const { jwtVerify } = await import("jose");
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(c.env.JWT_SECRET),
      {
        algorithms: ["HS256"],
      },
    );
    c.set("jwtPayload", payload);
    await next();
  } catch {
    return c.json(
      { data: null, error: { code: "AUTH_004", message: "JWT_INVALID" } },
      401,
    );
  }
});

// Rate limit middleware for API
app.use("/api/*", async (c: Context<{ Bindings: Bindings }>, next) => {
  const userId = c.get("jwtPayload")?.sub || "anonymous";
  const { allowed, remaining } = await checkRateLimit(c.env, userId);
  if (!allowed) {
    return c.json(
      { data: null, error: { code: "AUTH_003", message: "OTP_RATE_LIMITED" } },
      429,
    );
  }
  c.header("X-RateLimit-Remaining", String(remaining));
  await next();
});

// Test endpoint: verify JWT is working
app.get("/api/me", (c: Context<{ Bindings: Bindings }>) => {
  const payload = c.get("jwtPayload");
  return c.json({ data: { user: payload } });
});

// Chat API proxy
app.all("/api/chat/*", (c: Context<{ Bindings: Bindings }>) => {
  return proxyToVPS(c.req.raw, c.req.path.replace("/api", ""));
});

// Memory API proxy
app.all("/api/memory/*", (c: Context<{ Bindings: Bindings }>) => {
  return proxyToVPS(c.req.raw, c.req.path.replace("/api", ""));
});

// Capture API proxy
app.all("/api/capture/*", (c: Context<{ Bindings: Bindings }>) => {
  return proxyToVPS(c.req.raw, c.req.path.replace("/api", ""));
});

// Studio API proxy
app.all("/api/studio/*", (c: Context<{ Bindings: Bindings }>) => {
  return proxyToVPS(c.req.raw, c.req.path.replace("/api", ""));
});

// Console API proxy
app.all("/api/console/*", (c: Context<{ Bindings: Bindings }>) => {
  return proxyToVPS(c.req.raw, c.req.path.replace("/api", ""));
});

// Admin API proxy
app.all("/admin/*", (c: Context<{ Bindings: Bindings }>) => {
  return proxyToVPS(c.req.raw, c.req.path);
});

// ─── FRONTEND (served via [assets] in wrangler.toml) ────
// The [assets] directive serves the React build from ./static/
// This handler is a fallback for SPA client-side routing
app.notFound((c: Context<{ Bindings: Bindings }>) => {
  return c.html(
    `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ajino v5</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#070910;color:#dde2ec;font-family:'DM Sans',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh}
    .card{text-align:center;padding:40px}
    h1{font-size:48px;color:#00c8a4;font-family:'Exo 2',sans-serif;margin-bottom:16px}
    p{color:#52586a;margin-bottom:24px;font-family:'DM Sans',sans-serif}
    .status{font-size:12px;color:#00c8a4;margin-top:24px;font-family:'JetBrains Mono',monospace}
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@600&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
</head>
<body>
  <div class="card">
    <h1>Ajino v5</h1>
    <p>Private Executive Intelligence Platform</p>
    <div class="status">Dang tai ung dung...</div>
  </div>
  <script>
    var tg = window.Telegram?.WebApp;
    if (tg) { tg.ready(); tg.expand(); }
  </script>
</body>
</html>`,
    200,
  );
});

export default app;
