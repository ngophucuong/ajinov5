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
} from "./types";
import { getToken } from "./auth";

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

export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  return request<ChatMessage[]>("GET", `/api/chat/sessions/${sessionId}/messages`);
}

export async function sendMessage(
  sessionId: string,
  content: string,
  reasoningMode: ReasoningMode,
): Promise<{ session_id: string }> {
  return request<{ session_id: string }>("POST", `/api/chat/sessions/${sessionId}/messages`, {
    content,
    reasoning_mode: reasoningMode,
  });
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

export async function commitCapture(id: string): Promise<{ memory_ids: string[] }> {
  return request("POST", `/api/capture/${id}/commit`);
}

// ─── Studio ───────────────────────────────────────────
export async function getDocuments(): Promise<StudioDocument[]> {
  return request<StudioDocument[]>("GET", "/api/studio/documents");
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

export async function compileDocument(id: string): Promise<{ memory_ids: string[]; count: number }> {
  return request("POST", `/api/studio/documents/${id}/compile`);
}

export async function deleteDocument(id: string): Promise<null> {
  return request("DELETE", `/api/studio/documents/${id}`);
}

// ─── Console ──────────────────────────────────────────
export async function getAgents(): Promise<AgentStatus[]> {
  return request<AgentStatus[]>("GET", "/api/console/agents");
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
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.action) qs.set("action", params.action);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  return request<AuditLogEntry[]>("GET", `/api/console/audit?${qs.toString()}`);
}

export async function getSkills(): Promise<SkillStatus[]> {
  return request<SkillStatus[]>("GET", "/api/console/skills");
}

// ─── Admin ────────────────────────────────────────────
export async function bulkApproveMemory(ids: string[]): Promise<{ approved: number; failed: number }> {
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
