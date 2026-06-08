import type { SSEEvent, ReasoningMode } from "./types";
import { getToken } from "./auth";

// ─── SSE Stream Reader ────────────────────────────────
export interface SSEController {
  onTrace: (step: SSEEvent & { event: "trace" }) => void;
  onToken: (delta: string) => void;
  onDone: (messageId: string, memoryCandidates: Array<{ content: string; confidence: number }>) => void;
  onError: (code: string, message: string) => void;
}

export async function streamChatMessage(
  sessionId: string,
  content: string,
  reasoningMode: ReasoningMode,
  callbacks: SSEController,
): Promise<void> {
  const token = getToken();
  if (!token) {
    callbacks.onError("AUTH_004", "JWT_INVALID");
    return;
  }

  const res = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      content,
      reasoning_mode: reasoningMode,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    callbacks.onError(
      body?.error?.code || "CHAT_002",
      body?.error?.message || "LLM_ERROR",
    );
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("CHAT_002", "No response stream");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const dataStr = line.slice(6).trim();
        if (!dataStr) continue;

        try {
          const event = JSON.parse(dataStr) as SSEEvent;
          switch (event.event) {
            case "trace":
              callbacks.onTrace(event as SSEEvent & { event: "trace" });
              break;
            case "token":
              callbacks.onToken(event.data.delta);
              break;
            case "done":
              callbacks.onDone(event.data.message_id, event.data.memory_candidates);
              break;
            case "error":
              callbacks.onError(event.data.code, event.data.message);
              break;
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }
  } catch (err) {
    callbacks.onError("CHAT_002", err instanceof Error ? err.message : "Stream error");
  }
}

// ─── Stream session creation ──────────────────────────
export async function createSessionAndStream(
  firstMessage: string,
  reasoningMode: ReasoningMode,
  callbacks: SSEController,
): Promise<string> {
  const token = getToken();
  if (!token) {
    callbacks.onError("AUTH_004", "JWT_INVALID");
    throw new Error("Not authenticated");
  }

  const res = await fetch("/api/chat/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      first_message: firstMessage,
      reasoning_mode: reasoningMode,
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    callbacks.onError(body.error?.code || "CHAT_001", body.error?.message || "SESSION_NOT_FOUND");
    throw new Error(body.error?.message || "Failed to create session");
  }

  const sessionId = body.data.session_id;
  return sessionId;
}
