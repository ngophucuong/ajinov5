import type { SSEEvent, ReasoningMode, ResearchSSEEvent } from "./types";
import { getToken } from "./auth";

// ─── SSE Stream Reader ────────────────────────────────
export interface SSEController {
  onTrace: (step: SSEEvent & { event: "trace" }) => void;
  onToken: (delta: string) => void;
  onDone: (
    messageId: string,
    memoryCandidates: Array<{ content: string; confidence: number }>,
  ) => void;
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

  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      content,
      reasoning_mode: reasoningMode,
      session_id: sessionId,
      surface: "web",
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
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";

      for (const chunk of chunks) {
        const lines = chunk.split("\n");
        let eventType = "message";
        const dataParts: string[] = [];

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataParts.push(line.slice(5).trim());
          }
        }

        const dataStr = dataParts.join("\n").trim();
        const payload = dataStr ? JSON.parse(dataStr) : {};

        switch (eventType) {
          case "trace":
            callbacks.onTrace({
              event: "trace",
              data: payload,
            } as SSEEvent & { event: "trace" });
            break;
          case "token":
            callbacks.onToken(payload.delta || "");
            break;
          case "done":
            callbacks.onDone(
              payload.message_id || "",
              payload.memory_candidates || [],
            );
            break;
          case "error":
            callbacks.onError(payload.code || "CHAT_002", payload.message || "LLM_ERROR");
            break;
          default:
            break;
        }
      }
    }
  } catch (err) {
    callbacks.onError(
      "CHAT_002",
      err instanceof Error ? err.message : "Stream error",
    );
  }
}

// ─── Stream session creation ──────────────────────────
export async function createSessionAndStream(
  firstMessage: string,
  _reasoningMode: ReasoningMode,
  _callbacks: SSEController,
): Promise<string> {
  const token = getToken();
  if (!token) {
    _callbacks.onError("AUTH_004", "JWT_INVALID");
    throw new Error("Not authenticated");
  }

  const res = await fetch("/api/chat/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: firstMessage.slice(0, 80),
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    _callbacks.onError(
      body.error?.code || "CHAT_001",
      body.error?.message || "SESSION_NOT_FOUND",
    );
    throw new Error(body.error?.message || "Failed to create session");
  }

  const sessionId = body.data.id;
  return sessionId;
}

// ─── Deep Research SSE Stream ────────────────────────
export interface ResearchController {
  onStart: () => void;
  onPlan: (questions: string[]) => void;
  onProgress: (
    step: string,
    question?: string,
    index?: number,
    total?: number,
  ) => void;
  onDone: (
    docId: string,
    title: string,
    wordCount: number,
    questionCount: number,
  ) => void;
  onError: (message: string) => void;
}

export async function streamResearch(
  topic: string,
  callbacks: ResearchController,
  signal?: AbortSignal,
): Promise<void> {
  const token = getToken();

  const res = await fetch("/api/research/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ topic }),
    signal,
  });

  if (!res.ok) {
    callbacks.onError(`HTTP ${res.status}: Không thể bắt đầu nghiên cứu`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("Không có response stream");
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
          const event = JSON.parse(dataStr) as ResearchSSEEvent;
          switch (event.event) {
            case "start":
              callbacks.onStart();
              break;
            case "plan":
              callbacks.onPlan(event.questions);
              break;
            case "progress":
              callbacks.onProgress(
                event.step,
                event.question,
                event.index,
                event.total,
              );
              break;
            case "done":
              callbacks.onDone(
                event.doc_id,
                event.title,
                event.word_count,
                event.question_count,
              );
              break;
            case "error":
              callbacks.onError(event.message);
              break;
            case "heartbeat":
              // Update elapsed time silently
              callbacks.onProgress(
                "heartbeat",
                undefined,
                undefined,
                undefined,
              );
              break;
            case "warning":
              // Show warning to user
              callbacks.onProgress("warning", event.message);
              break;
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return; // User stopped — no error
    }
    callbacks.onError(
      err instanceof Error ? err.message : "Lỗi stream nghiên cứu",
    );
  }
}
