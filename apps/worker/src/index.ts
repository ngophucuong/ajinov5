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
  TUNNEL_BASE: "http://72.60.210.110:8000", // Worker on Edge → VPS Agno (direct, tunnel WIP)
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
  INTERNAL_SECRET: string;
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

// Telegram webhook proxy → Messaging Gateway
app.all("/telegram/*", async (c: Context<{ Bindings: Bindings }>) => {
  // Proxy to messaging gateway (port 3000) via tunnel
  const url = new URL(c.req.url);
  const target = `http://messaging:3000${c.req.path}${url.search}`;

  // For tunnel routing, use the webhook subdomain
  const targetUrl = `https://webhook.ajinov5.cuong.ngo${c.req.path}${url.search}`;

  try {
    const headers = new Headers(c.req.raw.headers);
    headers.set(
      "X-Forwarded-For",
      c.req.header("CF-Connecting-IP") || "unknown",
    );

    return await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body:
        c.req.method !== "GET" && c.req.method !== "HEAD"
          ? await c.req.raw.clone().arrayBuffer()
          : undefined,
    });
  } catch {
    return c.json(
      {
        data: null,
        error: { code: "SVC_001", message: "SERVICE_UNAVAILABLE" },
      },
      503,
    );
  }
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

// Research API proxy (Deep Research mode)
app.all("/api/research/*", (c: Context<{ Bindings: Bindings }>) => {
  return proxyToVPS(c.req.raw, c.req.path.replace("/api", ""));
});

// Admin API proxy (via /api prefix)
app.all("/api/admin/*", (c: Context<{ Bindings: Bindings }>) => {
  return proxyToVPS(c.req.raw, c.req.path.replace("/api", ""));
});

// Admin API proxy (direct paths — avoid intercepting SPA page load at GET /admin)
app.post("/admin/memory/bulk-approve", (c: Context<{ Bindings: Bindings }>) => {
  return proxyToVPS(c.req.raw, c.req.path);
});
app.get("/admin/audit/export", (c: Context<{ Bindings: Bindings }>) => {
  return proxyToVPS(c.req.raw, c.req.path);
});
app.get("/admin/audit", (c: Context<{ Bindings: Bindings }>) => {
  return proxyToVPS(c.req.raw, c.req.path);
});
app.get("/admin/settings", (c: Context<{ Bindings: Bindings }>) => {
  return proxyToVPS(c.req.raw, c.req.path);
});
// Catch-all admin sub-routes (POST, PUT, PATCH to /admin/...)
app.all("/admin/:path{[^/]+}", (c: Context<{ Bindings: Bindings }>) => {
  return proxyToVPS(c.req.raw, c.req.path);
});

// ─── INTERNAL ROUTES (VPS → Worker KV access) ──────────
// Protected by X-Internal-Secret header
const internalAuth = async (
  c: Context<{ Bindings: Bindings }>,
  next: Function,
) => {
  const secret = c.req.header("X-Internal-Secret");
  if (secret !== c.env.INTERNAL_SECRET) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
};

// Get Telegram state
app.get(
  "/internal/kv/tgstate/:id",
  internalAuth,
  async (c: Context<{ Bindings: Bindings }>) => {
    const val = await c.env.OTP_KV.get(`tgstate:${c.req.param("id")}`, {
      type: "json",
    });
    return val ? c.json(val) : c.json(null, 404);
  },
);

// Set Telegram state (TTL 300s)
app.put(
  "/internal/kv/tgstate/:id",
  internalAuth,
  async (c: Context<{ Bindings: Bindings }>) => {
    const body = await c.req.json();
    await c.env.OTP_KV.put(
      `tgstate:${c.req.param("id")}`,
      JSON.stringify(body),
      { expirationTtl: 300 },
    );
    return c.json({ ok: true });
  },
);

// Delete Telegram state
app.delete(
  "/internal/kv/tgstate/:id",
  internalAuth,
  async (c: Context<{ Bindings: Bindings }>) => {
    await c.env.OTP_KV.delete(`tgstate:${c.req.param("id")}`);
    return c.json({ ok: true });
  },
);

// Short-term buffer for Telegram context (30min TTL)
app.get(
  "/internal/kv/stbuf/:id",
  internalAuth,
  async (c: Context<{ Bindings: Bindings }>) => {
    const val = await c.env.OTP_KV.get(`stbuf:${c.req.param("id")}`, {
      type: "json",
    });
    return val ? c.json(val) : c.json(null, 404);
  },
);

app.put(
  "/internal/kv/stbuf/:id",
  internalAuth,
  async (c: Context<{ Bindings: Bindings }>) => {
    const body = await c.req.json();
    await c.env.OTP_KV.put(`stbuf:${c.req.param("id")}`, JSON.stringify(body), {
      expirationTtl: 1800,
    });
    return c.json({ ok: true });
  },
);

app.delete(
  "/internal/kv/stbuf/:id",
  internalAuth,
  async (c: Context<{ Bindings: Bindings }>) => {
    await c.env.OTP_KV.delete(`stbuf:${c.req.param("id")}`);
    return c.json({ ok: true });
  },
);

// ─── FRONTEND (served via [assets] in wrangler.toml) ────
// Serve React SPA for all frontend routes
// All static files (JS, CSS, images) are served automatically via [assets]
// This notFound handler serves index.html for SPA client-side routing
app.notFound(async (c: Context<{ Bindings: Bindings }>) => {
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  return c.html(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ajino v5</title>
  <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script type="module" crossorigin src="/assets/index-24AhfoVi.js"></script>
  <link rel="stylesheet" crossorigin href="/assets/index-BbhOUUwD.css">
</head>
<body>
  <div id="root"></div>
</body>
</html>`);
});

export default app;
