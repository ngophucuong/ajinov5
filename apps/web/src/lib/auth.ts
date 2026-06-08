import type { User } from "./types";

const TOKEN_KEY = "ajino_token";

// ─── Token helpers ────────────────────────────────────
export function getToken(): string | null {
  // Try localStorage first (for dev convenience), cookie is httpOnly on prod
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) return stored;

  // Fallback: read from cookie (non-httpOnly case)
  const match = document.cookie.match(/ajino_token=([^;]+)/);
  return match ? match[1] : null;
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ─── Auth helpers ─────────────────────────────────────
export function isAuthenticated(): boolean {
  return getToken() !== null;
}

// ─── API calls ────────────────────────────────────────
export async function requestOTP(telegramId: number): Promise<{ expires_in: number }> {
  const res = await fetch("/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegram_id: telegramId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "OTP request failed");
  return body.data;
}

export async function verifyOTP(
  telegramId: number,
  otp: string,
): Promise<{ user: User; token: string }> {
  const res = await fetch("/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegram_id: telegramId, otp }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "OTP verification failed");

  setToken(body.data.token);
  return body.data;
}

export async function logout(): Promise<void> {
  clearToken();
  await fetch("/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}
