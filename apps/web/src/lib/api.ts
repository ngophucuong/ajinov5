import type {
  ApiResponse,
  ChatSession,
  ChatMessage,
  MemoryItem,
  CaptureItem,
  StudioDocument,
  AgentStatus,
  SkillStatus,
  AuditLogEntry,
  ReasoningMode,
  ResearchJobStatus,
} from "./types";
import { getToken } from "./auth";

// ─── Non-JSON fetch helper (for FormData) ──────────────
async function fetchToken(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(path, { ...init, headers, credentials: "include" });
}

// ─── Base request helper ──────────────────────────────
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json: ApiResponse<T> = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `HTTP ${res.status}`);
  }
  return json.data as T;
}

// ─── Chat ─────────────────────────────────────────────
export async function getSessions(): Promise<ChatSession[]> {
  return request<ChatSession[]>("GET", "/api/chat/sessions");
}

export async function getSessionMessages(
  sessionId: string,
): Promise<ChatMessage[]> {
  return request<ChatMessage[]>(
    "GET",
    `/api/chat/sessions/${sessionId}/messages`,
  );
}

export async function sendMessage(
  sessionId: string,
  content: string,
  reasoningMode: ReasoningMode,
): Promise<{ session_id: string }> {
  return request<{ session_id: string }>(
    "POST",
    `/api/chat/sessions/${sessionId}/messages`,
    {
      content,
      reasoning_mode: reasoningMode,
    },
  );
}

export async function createSession(
  title?: string,
): Promise<{ id: string; title: string }> {
  return request<{ id: string; title: string }>("POST", "/api/chat/sessions", {
    title,
  });
}

export async function renameSession(
  sessionId: string,
  title: string,
): Promise<{ id: string; title: string; updated: boolean }> {
  return request<{ id: string; title: string; updated: boolean }>(
    "PATCH",
    `/api/chat/sessions/${sessionId}`,
    { title },
  );
}

export async function deleteSession(sessionId: string): Promise<null> {
  return request<null>("DELETE", `/api/chat/sessions/${sessionId}`);
}

export async function getResearchStatus(
  jobId: string,
): Promise<ResearchJobStatus> {
  return request<ResearchJobStatus>("GET", `/research/${jobId}/status`);
}

export async function startResearchV2(
  query: string,
): Promise<{ job_id: string; status: string; session_id?: string }> {
  return request<{ job_id: string; status: string; session_id?: string }>(
    "POST",
    "/api/research/start",
    { query },
  );
}

// ─── Memory ───────────────────────────────────────────
export async function getMemories(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<MemoryItem[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  return request<MemoryItem[]>("GET", `/api/memory?${qs.toString()}`);
}

export async function updateMemory(
  id: string,
  data: { status?: "canonical" | "archived"; content?: string },
): Promise<{ id: string; status: string; updated: boolean }> {
  return request("PATCH", `/api/memory/${id}`, data);
}

export async function createMemory(data: {
  content: string;
  source: "manual";
}): Promise<{ id: string; status: string }> {
  return request("POST", "/api/memory", data);
}

// ─── Capture ──────────────────────────────────────────
export async function getCaptures(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<CaptureItem[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  return request<CaptureItem[]>("GET", `/api/capture?${qs.toString()}`);
}

export async function createCapture(data: {
  type: "text" | "link";
  content?: string;
  url?: string;
}): Promise<{ id: string; status: string }> {
  return request("POST", "/api/capture", data);
}

export async function commitCapture(
  id: string,
): Promise<{ memory_ids: string[] }> {
  return request("POST", `/api/capture/${id}/commit`);
}

// ─── Studio ───────────────────────────────────────────
export async function getDocuments(): Promise<StudioDocument[]> {
  return request<StudioDocument[]>("GET", "/api/studio/documents");
}

export async function getDocument(id: string): Promise<StudioDocument> {
  return request<StudioDocument>("GET", `/api/studio/documents/${id}`);
}

export async function createDocument(data: {
  title: string;
  content: string;
}): Promise<{ id: string; title: string; compile_status: string }> {
  return request("POST", "/api/studio/documents", data);
}

export async function updateDocument(
  id: string,
  data: { title?: string; content?: string },
): Promise<{ id: string; updated: boolean }> {
  return request("PUT", `/api/studio/documents/${id}`, data);
}

export async function compileDocument(
  id: string,
): Promise<{ memory_ids: string[]; count: number }> {
  return request("POST", `/api/studio/documents/${id}/compile`, {});
}

export async function deleteDocument(id: string): Promise<null> {
  return request("DELETE", `/api/studio/documents/${id}`);
}

export async function uploadDocument(
  file: File,
  title?: string,
): Promise<{ id: string; title: string; compile_status: string }> {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);

  const res = await fetchToken("/api/studio/documents", {
    method: "POST",
    body: form,
  });

  const json: ApiResponse<{
    id: string;
    title: string;
    compile_status: string;
  }> = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || "Upload thất bại");
  }
  return json.data!;
}

// ─── Console ──────────────────────────────────────────
export async function getAgents(): Promise<AgentStatus[]> {
  return request<AgentStatus[]>("GET", "/api/console/agents");
}

export async function updateSkill(
  name: string,
  enabled: boolean,
): Promise<{ name: string; enabled: boolean }> {
  return request("PATCH", `/api/console/skills/${encodeURIComponent(name)}`, {
    enabled,
  });
}

export async function getAudit(params?: {
  limit?: number;
  offset?: number;
  action?: string;
  from?: string;
  to?: string;
}): Promise<AuditLogEntry[]> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.action) qs.set("action", params.action);
  return request<AuditLogEntry[]>("GET", `/admin/audit?${qs.toString()}`);
}

export async function getSkills(): Promise<SkillStatus[]> {
  return request<SkillStatus[]>("GET", "/api/console/skills");
}

// ─── Admin ────────────────────────────────────────────
export async function bulkApproveMemory(
  ids: string[],
): Promise<{ approved: number; failed: number }> {
  return request("POST", "/admin/memory/bulk-approve", { ids });
}

export async function getAdminSettings(): Promise<{
  version: string;
  tenant_id: string;
  db_connected: boolean;
  pgvector_connected: boolean;
}> {
  return request("GET", "/admin/settings");
}

export interface AdminMetrics {
  canonical_count: number;
  pending_count: number;
  sessions_today: number;
  tokens_today: number;
  recent_audit: Array<{
    id: string;
    action: string;
    resource: string;
    model?: string;
    tokens?: number;
    created_at: string;
  }>;
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  return request<AdminMetrics>("GET", "/api/admin/metrics");
}

export async function getAdminAudit(cursor?: string): Promise<{
  entries: AuditLogEntry[];
  next_cursor: string | null;
}> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request("GET", `/admin/audit${qs}`);
}

export function getAuditExportUrl(from?: string, to?: string): string {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  return `/admin/audit/export?${qs.toString()}`;
}

// ─── Mini App — Adaptive Mode ──────────────────────────
import type {
  AdaptiveModeResponse,
  MemorySearchResult,
  PendingMemorySummary,
  ContextMemoryCard,
} from "./types";

export async function getAdaptiveMode(
  telegramId: string,
): Promise<AdaptiveModeResponse> {
  return request<AdaptiveModeResponse>(
    "GET",
    `/api/user/adaptive-mode?telegram_id=${encodeURIComponent(telegramId)}`,
  );
}

export async function logMiniAppOpen(data: {
  telegram_id: string;
  mode_shown: string;
  vn_hour: number;
  had_meeting_soon: boolean;
  duration_seconds: number;
}): Promise<{ recorded: boolean }> {
  return request("POST", "/api/user/adaptive-mode/open-log", data);
}

export async function getTelegramSessionId(
  telegramId: string,
): Promise<{ session_id: string }> {
  return request<{ session_id: string }>(
    "GET",
    `/api/chat/sessions/telegram?telegram_id=${encodeURIComponent(telegramId)}`,
  );
}

export async function searchMemories(
  query: string,
  topK: number = 3,
): Promise<MemorySearchResult[]> {
  return request<MemorySearchResult[]>(
    "GET",
    `/api/memory/search?q=${encodeURIComponent(query)}&top_k=${topK}`,
  );
}

export async function getMemorySummary(): Promise<PendingMemorySummary> {
  return request<PendingMemorySummary>("GET", "/api/memory/summary");
}

export async function getPendingMemoriesPaginated(
  offset: number = 0,
  limit: number = 1,
): Promise<MemoryItem[]> {
  return getMemories({ status: "pending", limit, offset });
}

// ─── Mini App — Schedule ───────────────────────────────
import type { ScheduleItem } from "./types";

export async function getSchedule(date?: string): Promise<{
  items: ScheduleItem[];
  next: {
    id: string;
    title: string;
    start_time: string;
    duration_min: number;
    minutes_until: number;
  } | null;
}> {
  const qs = new URLSearchParams();
  if (date) qs.set("date", date);
  qs.set("next", "true");
  return request("GET", `/api/ops/schedule?${qs.toString()}`);
}

export async function getTodaySchedule(): Promise<{
  items: ScheduleItem[];
  next: null;
}> {
  return request("GET", "/api/ops/schedule?date=today");
}
