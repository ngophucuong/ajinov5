import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getToken, requestOTP, verifyOTP, logout, setToken } from "../lib/auth";
import type {
  ThinkingTraceStep,
  ReasoningMode,
  MemoryItem,
} from "../lib/types";
import {
  streamChatMessage,
  createSessionAndStream,
  streamResearch,
} from "../lib/sse";
import {
  createMemory,
  createSession,
  renameSession,
  deleteSession,
  getSessions,
  getSessionMessages,
  startResearchV2,
} from "../lib/api";
import AgentNetwork from "../components/AgentNetwork";
import ThinkingTrace from "../components/ThinkingTrace";
import ContextPanel from "../components/ContextPanel";
import SendButton from "../components/SendButton";
import ResearchProgressCard, {
  type ResearchState,
} from "../components/ResearchProgressCard";
import ResearchPanel from "../components/ResearchPanel";
import ConfirmModal from "../components/ConfirmModal";

// ─── Messages in this session ──────────────────────
interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: ThinkingTraceStep[];
  reasoningMode?: ReasoningMode;
  isStreaming?: boolean;
  elapsedMs?: number;
}

export default function Chat() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(!!getToken());
  const [tgId, setTgId] = useState("5250339472");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleRequestOTP() {
    setAuthError("");
    setAuthLoading(true);
    try {
      await requestOTP(Number(tgId));
      setOtpSent(true);
    } catch {
      setAuthError("Không gửi được OTP");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyOTP() {
    setAuthError("");
    setAuthLoading(true);
    try {
      await verifyOTP(Number(tgId), otp);
      setAuthed(true);
    } catch {
      setAuthError("Mã OTP không đúng");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    logout();
    setAuthed(false);
    setOtpSent(false);
    setOtp("");
  }

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [mode, setMode] = useState<ReasoningMode>("auto");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [votes, setVotes] = useState<Record<string, "up" | "down">>({});
  const [researchArmed, setResearchArmed] = useState(false);
  const [sessions, setSessions] = useState<
    Array<{ id: string; title: string; time: string; tag?: string }>
  >([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [researchJobId, setResearchJobId] = useState<string | null>(null);
  const msgAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const researchAbortRef = useRef<AbortController | null>(null);

  // ─── Session management ────────────────────────────
  // Load sessions on mount
  useEffect(() => {
    getSessions()
      .then((data) => {
        if (data && data.length > 0) {
          const mapped = data.map((s) => ({
            id: s.id,
            title: s.title || "Cuộc trò chuyện mới",
            time: new Date(s.updated_at).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            tag: s.tags?.[0],
          }));
          setSessions(mapped);
          // Auto-select first session
          if (!activeSessionId) {
            setActiveSessionId(mapped[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Load messages when active session changes
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    getSessionMessages(activeSessionId)
      .then((data) => {
        if (data && data.length > 0) {
          setMessages(
            data.map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              trace: m.thinking_trace as ThinkingTraceStep[] | undefined,
              reasoningMode: (m.reasoning_mode as ReasoningMode) || undefined,
            })),
          );
        } else {
          setMessages([]);
        }
      })
      .catch(() => {
        setMessages([]);
      });
  }, [activeSessionId]);

  async function handleNewSession() {
    try {
      const s = await createSession();
      setSessions((prev) => [
        { id: s.id, title: s.title, time: "bây giờ" },
        ...prev,
      ]);
      setActiveSessionId(s.id);
      setMessages([]);
    } catch {
      const id = crypto.randomUUID();
      setSessions((prev) => [
        { id, title: "Cuộc trò chuyện mới", time: "bây giờ" },
        ...prev,
      ]);
      setActiveSessionId(id);
      setMessages([]);
    }
  }

  async function handleRenameSession(id: string) {
    if (!editingSessionTitle.trim()) {
      setEditingSessionId(null);
      return;
    }
    try {
      await renameSession(id, editingSessionTitle.trim());
    } catch {
      // continue with local update
    }
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, title: editingSessionTitle.trim() } : s,
      ),
    );
    setEditingSessionId(null);
    setEditingSessionTitle("");
  }

  async function handleDeleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteTargetId(id);
  }

  async function confirmDeleteSession() {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);
    try {
      await deleteSession(id);
    } catch {
      // continue
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      setActiveSessionId(remaining[0]?.id || null);
      setMessages([]);
    }
  }

  // ─── Deep Research state ───────────────────────────
  const initialResearchState: ResearchState = {
    phase: "idle",
    topic: "",
    questions: [],
    currentIndex: 0,
    totalQuestions: 0,
    currentQuestion: "",
    docId: null,
    docTitle: "",
    wordCount: 0,
    questionCount: 0,
    errorMessage: "",
    elapsedMs: 0,
  };
  const [research, setResearch] = useState<ResearchState>(initialResearchState);
  const researchStartRef = useRef<number>(0);
  const researchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // Research timer
  useEffect(() => {
    if (
      research.phase !== "planning" &&
      research.phase !== "researching" &&
      research.phase !== "compiling"
    ) {
      if (researchIntervalRef.current)
        clearInterval(researchIntervalRef.current);
      return;
    }
    researchIntervalRef.current = setInterval(() => {
      setResearch((prev) => ({
        ...prev,
        elapsedMs: Date.now() - researchStartRef.current,
      }));
    }, 100);
    return () => {
      if (researchIntervalRef.current)
        clearInterval(researchIntervalRef.current);
    };
  }, [research.phase]);

  async function startResearch(topic: string) {
    if (!topic.trim()) return;

    const trimmedTopic = topic.trim();
    setResearch({
      ...initialResearchState,
      phase: "planning",
      topic: trimmedTopic,
    });
    researchStartRef.current = Date.now();

    try {
      const controller = new AbortController();
      researchAbortRef.current = controller;
      await streamResearch(
        trimmedTopic,
        {
          onStart: () => {
            setResearch((prev) => ({ ...prev, phase: "planning" }));
          },
          onPlan: (questions) => {
            setResearch((prev) => ({
              ...prev,
              phase: "researching",
              questions,
              totalQuestions: questions.length,
              currentIndex: 0,
              currentQuestion: questions[0] || "",
            }));
          },
          onProgress: (step, question, index, total) => {
            if (step === "researching") {
              setResearch((prev) => ({
                ...prev,
                currentIndex: index || prev.currentIndex,
                currentQuestion: question || prev.currentQuestion,
                totalQuestions: total || prev.totalQuestions,
              }));
            } else if (step === "compiling") {
              setResearch((prev) => ({ ...prev, phase: "compiling" }));
            } else if (step === "heartbeat") {
              // Update elapsed time
              setResearch((prev) => ({
                ...prev,
                elapsedMs: Date.now() - researchStartRef.current,
              }));
            } else if (step === "warning") {
              setResearch((prev) => ({
                ...prev,
                warningMessage: question || "",
              }));
            }
          },
          onDone: (docId, title, wordCount, questionCount) => {
            setResearch((prev) => ({
              ...prev,
              phase: "done",
              docId,
              docTitle: title,
              wordCount,
              questionCount,
              elapsedMs: Date.now() - researchStartRef.current,
            }));
            // Add research result as chat messages
            const userMsg: UIMessage = {
              id: crypto.randomUUID(),
              role: "user",
              content: `🔬 Nghiên cứu sâu: ${title}`,
            };
            const assistantMsg: UIMessage = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `**📄 ${title}**\n\n> Báo cáo nghiên cứu đã được tạo với **${questionCount}** câu hỏi, **${wordCount.toLocaleString()}** từ.\n>\n> 📂 Đã lưu vào **[Studio →](/studio)** để xem chi tiết, chỉnh sửa và compile thành bộ nhớ.`,
              reasoningMode: "deep",
              trace: [
                {
                  step: 1,
                  agent: "Deep Research",
                  status: "done",
                  duration_ms: research.elapsedMs || 0,
                  result: `${questionCount} câu hỏi · ${wordCount.toLocaleString()} từ · DeepSeek V4 Pro`,
                },
              ],
            };
            setMessages((prev) => [...prev, userMsg, assistantMsg]);
          },
          onError: (message) => {
            setResearch((prev) => ({
              ...prev,
              phase: "error",
              errorMessage: message,
            }));
          },
        },
        controller.signal,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        closeResearch();
        return;
      }
      setResearch((prev) => ({
        ...prev,
        phase: "error",
        errorMessage: err instanceof Error ? err.message : "Lỗi nghiên cứu",
      }));
    } finally {
      researchAbortRef.current = null;
    }
  }

  function stopResearch() {
    researchAbortRef.current?.abort();
    closeResearch();
  }

  function closeResearch() {
    setResearch(initialResearchState);
  }

  // Real-time streaming timer
  useEffect(() => {
    if (!streaming) {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      return;
    }
    streamIntervalRef.current = setInterval(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.isStreaming ? { ...m, elapsedMs: (m.elapsedMs || 0) + 100 } : m,
        ),
      );
    }, 100);
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, [streaming]);

  // Auto-scroll
  useEffect(() => {
    if (msgAreaRef.current) {
      msgAreaRef.current.scrollTop = msgAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
  const handleInput = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 130) + "px";
  }, []);

  // Send message
  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || streaming) return;

    setInput("");
    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const assistantMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      trace: [],
      reasoningMode: mode,
      isStreaming: true,
      elapsedMs: 0,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    const traceSteps: ThinkingTraceStep[] = [];
    let responseContent = "";
    const startTime = Date.now();

    // Try real SSE first, fall back to simulation
    try {
      // Try creating a session and streaming
      const sessionId = await createSessionAndStream(content, mode, {
        onTrace: (event) => {
          traceSteps.push(event.data);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    trace: [...traceSteps],
                    elapsedMs: Date.now() - startTime,
                  }
                : m,
            ),
          );
        },
        onToken: (delta) => {
          responseContent += delta;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    content: responseContent,
                    elapsedMs: Date.now() - startTime,
                  }
                : m,
            ),
          );
        },
        onDone: (_messageId, _candidates) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    isStreaming: false,
                    content: responseContent,
                    trace: traceSteps,
                    elapsedMs: Date.now() - startTime,
                  }
                : m,
            ),
          );
          setStreaming(false);
        },
        onError: (_code, _msg) => {
          // Fall back to simulation
          simulateResponse(content, mode, assistantMsg.id, startTime);
        },
      });
    } catch {
      simulateResponse(content, mode, assistantMsg.id, startTime);
    }
  }, [input, mode, streaming]);

  // Simulation fallback
  const simulateResponse = (
    query: string,
    rmode: ReasoningMode,
    msgId: string,
    startTime: number,
  ) => {
    const steps: ThinkingTraceStep[] = [
      {
        step: 1,
        agent: "Decompose",
        status: "done",
        duration_ms: 120,
        result: "Phân tích yêu cầu...",
      },
      {
        step: 2,
        agent: "Memory search",
        status: "done",
        duration_ms: 280,
        result: "Tìm kiếm bộ nhớ liên quan...",
      },
      {
        step: 3,
        agent: "Serper",
        status: "done",
        duration_ms: rmode === "deep" ? 750 : 350,
        result: "Tìm kiếm web...",
      },
      {
        step: 4,
        agent: "Synthesis",
        status: "done",
        duration_ms: 420,
        result:
          rmode === "deep"
            ? "DeepSeek V4 Pro · phân tích chuyên sâu"
            : "DeepSeek V3 Flash · phản hồi nhanh",
      },
    ];

    const resp =
      rmode === "deep"
        ? `**Phân tích chuyên sâu — ${query.slice(0, 40)}...**\n\nDựa trên dữ liệu hiện có và tìm kiếm web, tôi phân tích như sau:\n\n1. **Xu hướng thị trường**: Các chỉ số cho thấy sự dịch chuyển mạnh từ Q2 sang Q3.\n2. **Rủi ro chính**: Biến động tỷ giá và chính sách thương mại mới.\n3. **Khuyến nghị**: Ưu tiên đa dạng hóa chuỗi cung ứng trong Q4.`
        : `**Phản hồi nhanh**\n\n${query.slice(0, 60)}... — đây là phân tích sơ bộ dựa trên dữ liệu sẵn có. Để có phân tích chuyên sâu hơn, hãy chuyển sang chế độ Deep.`;

    let content = "";
    const words = resp.split(" ");
    let i = 0;
    const interval = setInterval(() => {
      if (i < words.length) {
        content += (i > 0 ? " " : "") + words[i];
        i++;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  content,
                  trace:
                    i >= words.length
                      ? steps
                      : steps.slice(0, -1).map((s) => ({ ...s })),
                  elapsedMs: Date.now() - startTime,
                }
              : m,
          ),
        );
      } else {
        clearInterval(interval);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  isStreaming: false,
                  content,
                  trace: steps,
                  elapsedMs: Date.now() - startTime,
                }
              : m,
          ),
        );
        setStreaming(false);
      }
    }, 30);
  };

  async function handleStartResearch(topic: string) {
    try {
      const { job_id, session_id } = await startResearchV2(topic);
      setResearchJobId(job_id);
      if (session_id) {
        setSessions((prev) => [
          { id: session_id, title: topic.slice(0, 40), time: "bây giờ" },
          ...prev,
        ]);
        setActiveSessionId(session_id);
        setMessages([]);
      }
    } catch {
      // ignore
    }
  }

  // Handle keypress
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (researchArmed && input.trim()) {
        handleStartResearch(input);
        setInput("");
        setResearchArmed(false);
      } else {
        handleSend();
      }
    }
  };

  // Context panel data — loaded from API or empty
  const [activeSkills, setActiveSkills] = useState<
    Array<{ name: string; status: "active" | "used" | "off"; stat: string }>
  >([]);
  const [contextMemories, setContextMemories] = useState<MemoryItem[]>([]);

  // Load context panel data when session changes
  useEffect(() => {
    // Load skills
    import("../lib/api").then(({ getSkills }) => {
      getSkills()
        .then((data) => {
          setActiveSkills(
            data.map((s) => ({
              name: s.description || s.name,
              status: s.enabled ? ("active" as const) : ("off" as const),
              stat: s.call_count_session ? `${s.call_count_session}×` : "—",
            })),
          );
        })
        .catch(() => setActiveSkills([]));
    });

    // Load context memories (canonical, recent)
    import("../lib/api").then(({ getMemories }) => {
      getMemories({ status: "canonical", limit: 3 })
        .then((data) => setContextMemories(data))
        .catch(() => setContextMemories([]));
    });
  }, [activeSessionId]);

  // ─── Auth screen ─────────────────────────────────
  if (!authed) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0c0f18] font-body">
        <div className="w-full max-w-[360px] mx-auto px-6 flex flex-col gap-5">
          <div className="text-center">
            <span className="font-display text-[48px] font-semibold text-[#00c8a4] leading-none tracking-[-0.03em]">
              A
            </span>
            <h1 className="font-display text-[22px] font-medium text-[#dde2ec] mt-2">
              Ajino v5
            </h1>
            <p className="font-mono text-[10px] text-[#52586a] tracking-[0.1em] mt-1">
              Executive AI · Đăng nhập bằng Telegram
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-[.1em] text-[#52586a]">
                Telegram ID
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={tgId}
                onChange={(e) => setTgId(e.target.value)}
                placeholder="VD: 5250339472"
                className="bg-[#070910] border border-[rgba(255,255,255,0.09)] rounded-[8px] px-4 py-2.5 text-[#dde2ec] font-body text-[14px] outline-none transition-colors focus:border-[#00c8a4] placeholder:text-[#52586a]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !otpSent) handleRequestOTP();
                  if (e.key === "Enter" && otpSent) handleVerifyOTP();
                }}
              />
            </label>
            {!otpSent ? (
              <button
                onClick={handleRequestOTP}
                disabled={authLoading || !tgId}
                className="w-full py-2.5 rounded-[8px] border-none cursor-pointer font-mono text-[12px] tracking-[0.05em] text-[#030e0a] transition-all disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(140deg, #00c8a4 0%, #0094d4 100%)",
                }}
              >
                {authLoading ? "Đang gửi..." : "Gửi mã OTP"}
              </button>
            ) : (
              <>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-[.1em] text-[#52586a]">
                    Mã OTP (kiểm tra Telegram)
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="bg-[#070910] border border-[rgba(255,255,255,0.09)] rounded-[8px] px-4 py-2.5 text-[#dde2ec] font-body text-[14px] text-center tracking-[0.3em] outline-none transition-colors focus:border-[#00c8a4] placeholder:text-[#52586a]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleVerifyOTP();
                    }}
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={handleRequestOTP}
                    disabled={authLoading}
                    className="flex-1 py-2.5 rounded-[8px] border border-[rgba(255,255,255,0.09)] bg-transparent cursor-pointer font-mono text-[11px] text-[#52586a] transition-all hover:bg-[#12161f] hover:text-[#dde2ec] disabled:opacity-50"
                  >
                    Gửi lại
                  </button>
                  <button
                    onClick={handleVerifyOTP}
                    disabled={authLoading || otp.length < 6}
                    className="flex-1 py-2.5 rounded-[8px] border-none cursor-pointer font-mono text-[12px] tracking-[0.05em] text-[#030e0a] transition-all disabled:opacity-50"
                    style={{
                      background:
                        "linear-gradient(140deg, #00c8a4 0%, #0094d4 100%)",
                    }}
                  >
                    {authLoading ? "Đang xác thực..." : "Xác nhận OTP"}
                  </button>
                </div>
              </>
            )}
            {authError && (
              <div className="px-3 py-2 rounded-[6px] bg-[rgba(224,104,104,0.09)] border border-[rgba(224,104,104,0.2)] text-[11px] font-mono text-[#e06868] text-center">
                {authError}
              </div>
            )}
            <div className="text-center">
              <a
                href="/admin"
                className="font-mono text-[9px] text-[#52586a] hover:text-[#dde2ec] transition-colors no-underline"
              >
                Vào trang Quản trị →
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Toast */}
      {toast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-[6px] font-mono text-[10px] text-[#dde2ec] bg-[#12161f] border border-[rgba(255,255,255,0.09)] shadow-lg">
          {toast}
        </div>
      )}

      {/* ─── Topbar ─────────────────────────────────── */}
      <header className="h-[46px] bg-[#0c0f18] border-b border-[rgba(255,255,255,0.05)] flex items-center px-4 gap-[10px] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-display text-[26px] font-semibold text-[#00c8a4] leading-none tracking-[-0.03em]">
            A
          </span>
          <div className="flex flex-col leading-none gap-0.5">
            <span className="font-display text-[13px] font-medium text-[#dde2ec] tracking-[0.05em]">
              Ajino
            </span>
            <span className="font-mono text-[8px] text-[#52586a] tracking-[0.12em]">
              v5 · Executive AI
            </span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-[20px] border border-[rgba(255,255,255,0.09)] bg-[#12161f]">
            <div className="w-[5px] h-[5px] rounded-full bg-[#00c8a4] animate-[pulse_2.4s_ease-in-out_infinite]" />
            <span className="font-mono text-[9px] tracking-[.08em] uppercase text-[#52586a]">
              Agents
            </span>
            <span className="font-mono text-[9px] text-[#00c8a4]">
              4 hoạt động
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleLogout}
            title="Đăng xuất"
            className="w-7 h-7 rounded-md border border-transparent bg-transparent flex items-center justify-center cursor-pointer transition-all text-sm text-[#52586a] hover:bg-[#12161f] hover:text-[#e06868]"
          >
            ⏻
          </button>
        </div>
      </header>

      {/* ─── Main 3-column layout ────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── Left sidebar (230px) ─────────────────── */}
        <aside className="w-[230px] flex-shrink-0 bg-[#0c0f18] border-r border-[rgba(255,255,255,0.05)] flex flex-col">
          <div className="px-[14px] pt-[11px] pb-[9px] border-b border-[rgba(255,255,255,0.05)]">
            <span className="font-mono text-[9px] uppercase tracking-[.12em] text-[#52586a]">
              Mạng Lưới Agent
            </span>
          </div>
          <div className="px-2 py-1.5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
            <AgentNetwork />
          </div>
          <div className="flex-1 overflow-y-auto py-[5px]">
            <div className="px-[14px] pt-[7px] pb-[3px] flex items-center justify-between">
              <span className="font-mono text-[8px] uppercase tracking-[.12em] text-[#d4a05a] opacity-55">
                Phiên chat
              </span>
              <button
                onClick={handleNewSession}
                title="Tạo phiên mới"
                className="w-5 h-5 rounded-[3px] flex items-center justify-center cursor-pointer bg-transparent border border-[rgba(255,255,255,0.09)] text-[#52586a] hover:text-[#dde2ec] hover:border-[rgba(255,255,255,0.15)] transition-all text-[11px]"
              >
                +
              </button>
            </div>
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                className={`group/session px-[14px] py-1.5 cursor-pointer border-l-2 transition-all ${
                  activeSessionId === s.id
                    ? "bg-[rgba(0,200,164,0.13)] border-l-[#00c8a4]"
                    : "border-l-transparent hover:bg-[rgba(0,200,164,0.06)] hover:border-l-[rgba(0,200,164,0.25)]"
                }`}
              >
                {editingSessionId === s.id ? (
                  <input
                    value={editingSessionTitle}
                    onChange={(e) => setEditingSessionTitle(e.target.value)}
                    onBlur={() => handleRenameSession(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSession(s.id);
                      if (e.key === "Escape") {
                        setEditingSessionId(null);
                        setEditingSessionTitle("");
                      }
                    }}
                    autoFocus
                    className="w-full bg-[#070910] border border-[rgba(255,255,255,0.09)] rounded-[4px] px-2 py-0.5 text-[11.5px] text-[#dde2ec] outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="text-[11.5px] text-[#dde2ec] whitespace-nowrap overflow-hidden text-ellipsis flex-1">
                        {s.title}
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover/session:opacity-100 transition-opacity ml-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSessionId(s.id);
                            setEditingSessionTitle(s.title);
                          }}
                          title="Đổi tên"
                          className="w-[18px] h-[18px] rounded-[3px] flex items-center justify-center cursor-pointer bg-transparent border-none text-[#52586a] hover:text-[#dde2ec] text-[10px]"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => handleDeleteSession(s.id, e)}
                          title="Xóa"
                          className="w-[18px] h-[18px] rounded-[3px] flex items-center justify-center cursor-pointer bg-transparent border-none text-[#52586a] hover:text-[#e06868] text-[10px]"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-[5px] items-center mt-0.5">
                      <span className="font-mono text-[9px] text-[#52586a]">
                        {s.time}
                      </span>
                      {s.tag && (
                        <span
                          className={`text-[9px] px-[5px] py-px rounded ${
                            s.tag === "strategy"
                              ? "bg-[rgba(139,114,240,0.08)] text-[#a48df5] border border-[rgba(139,114,240,0.2)]"
                              : s.tag === "finance"
                                ? "bg-[rgba(0,200,164,0.06)] text-[#40d4b8] border border-[rgba(0,200,164,0.2)]"
                                : "bg-[rgba(212,160,90,0.08)] text-[#d4a05a] border border-[rgba(212,160,90,0.2)]"
                          }`}
                        >
                          {s.tag}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* ─── Middle: Chat ──────────────────────────── */}
        <main className="flex-1 flex flex-col bg-[#070910] overflow-hidden">
          <div
            ref={msgAreaRef}
            className="flex-1 overflow-y-auto px-7 py-6 flex flex-col gap-[22px]"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={msg.role === "user" ? "self-end max-w-[66%]" : ""}
              >
                {msg.role === "user" ? (
                  <div className="bg-[#12161f] border border-[rgba(255,255,255,0.09)] rounded-[14px_14px_3px_14px] px-4 py-[11px] text-[13.5px] leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  <div className="flex flex-col gap-[9px]">
                    {msg.trace && msg.trace.length > 0 && (
                      <ThinkingTrace
                        steps={msg.trace}
                        reasoningMode={msg.reasoningMode || "auto"}
                        isStreaming={msg.isStreaming}
                        elapsedMs={msg.elapsedMs}
                      />
                    )}
                    {msg.content && (
                      <div
                        className="text-[14px] leading-[1.8] text-[#dde2ec] prose-sm"
                        dangerouslySetInnerHTML={{
                          __html: msg.content
                            .replace(/\n\n/g, "</p><p>")
                            .replace(/\n/g, "<br/>")
                            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                            .replace(
                              /`(.+?)`/g,
                              '<code class="font-mono text-[11px] bg-[#12161f] border border-[rgba(255,255,255,0.09)] px-1.5 py-px rounded text-[#6ec4a8]">$1</code>',
                            )
                            .replace(/^/, "<p>")
                            .replace(/$/, "</p>"),
                        }}
                      />
                    )}
                    {!msg.isStreaming && msg.content && (
                      <div className="flex items-center gap-[5px] opacity-0 hover:opacity-100 transition-opacity">
                        <button
                          className={`w-6 h-6 rounded-[5px] border flex items-center justify-center cursor-pointer transition-all text-[11px] ${
                            votes[msg.id] === "up"
                              ? "bg-[rgba(0,200,164,0.12)] border-[rgba(0,200,164,0.3)] text-[#00c8a4]"
                              : "border-[rgba(255,255,255,0.05)] bg-[#0c0f18] text-[#52586a] hover:bg-[#12161f] hover:text-[#dde2ec]"
                          }`}
                          title="Tán thành"
                          onClick={() =>
                            setVotes((v) => ({
                              ...v,
                              [msg.id]:
                                v[msg.id] === "up" ? ("" as never) : "up",
                            }))
                          }
                        >
                          ↑
                        </button>
                        <button
                          className={`w-6 h-6 rounded-[5px] border flex items-center justify-center cursor-pointer transition-all text-[11px] ${
                            votes[msg.id] === "down"
                              ? "bg-[rgba(224,104,104,0.12)] border-[rgba(224,104,104,0.3)] text-[#e06868]"
                              : "border-[rgba(255,255,255,0.05)] bg-[#0c0f18] text-[#52586a] hover:bg-[#12161f] hover:text-[#dde2ec]"
                          }`}
                          title="Không tán thành"
                          onClick={() =>
                            setVotes((v) => ({
                              ...v,
                              [msg.id]:
                                v[msg.id] === "down" ? ("" as never) : "down",
                            }))
                          }
                        >
                          ↓
                        </button>
                        <button
                          className="flex items-center gap-1 px-[9px] py-1 rounded-[5px] border border-[rgba(255,255,255,0.05)] bg-[#0c0f18] text-[#52586a] text-[10px] font-mono cursor-pointer transition-all hover:bg-[#12161f] hover:text-[#dde2ec] hover:border-[rgba(255,255,255,0.09)]"
                          title="Sao chép nội dung"
                          onClick={() => {
                            navigator.clipboard
                              .writeText(msg.content)
                              .catch(() => {});
                          }}
                        >
                          📋 sao chép
                        </button>
                        <button
                          className="flex items-center gap-1 px-[9px] py-1 rounded-[5px] border border-[rgba(255,255,255,0.05)] bg-[#0c0f18] text-[#52586a] text-[10px] font-mono cursor-pointer transition-all hover:bg-[rgba(212,160,90,0.08)] hover:text-[#d4a05a] hover:border-[rgba(212,160,90,0.3)]"
                          title="Lưu vào bộ nhớ"
                          onClick={async () => {
                            try {
                              await createMemory({
                                content: msg.content,
                                source: "manual",
                              });
                              flash("Đã lưu vào bộ nhớ");
                            } catch {
                              flash("Lỗi khi lưu");
                            }
                          }}
                        >
                          🧠 vào bộ nhớ
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Deep Research card */}
            {research.phase !== "idle" && (
              <div className="self-start w-full">
                <ResearchProgressCard
                  state={research}
                  onNavigateStudio={() => navigate("/studio")}
                  onClose={closeResearch}
                />
              </div>
            )}

            {/* Research V2 panel */}
            {researchJobId && (
              <div className="self-start w-full">
                <ResearchPanel
                  jobId={researchJobId}
                  onClose={() => setResearchJobId(null)}
                  onDone={(title, content, sectionCount) => {
                    // Add research result as chat messages with thinking trace
                    const userMsg: UIMessage = {
                      id: crypto.randomUUID(),
                      role: "user",
                      content: `🔬 Nghiên cứu sâu: ${title}`,
                    };
                    const assistantMsg: UIMessage = {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      content,
                      reasoningMode: "deep",
                      trace: [
                        {
                          step: 1,
                          agent: "Deep Research",
                          status: "done",
                          duration_ms: 0,
                          result: `${sectionCount} sections · đã lưu vào Studio`,
                        },
                      ],
                    };
                    setMessages((prev) => [...prev, userMsg, assistantMsg]);
                  }}
                />
              </div>
            )}
          </div>

          {/* ─── Input area ──────────────────────────── */}
          <div className="relative px-5 pt-[11px] pb-4 border-t border-[rgba(255,255,255,0.05)] bg-[#0c0f18] flex flex-col gap-[9px]">
            {/* Reasoning row */}
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-[.1em] text-[#52586a] mr-0.5">
                Suy nghĩ
              </span>
              <div className="flex">
                <button
                  onClick={() => {
                    setMode("auto");
                    setResearchArmed(false);
                  }}
                  title="Suy nghĩ tự động"
                  className={`px-3 py-1 border border-[rgba(255,255,255,0.09)] bg-transparent text-[#52586a] font-mono text-[10px] cursor-pointer transition-all rounded-l-[5px] ${
                    mode === "auto"
                      ? "!bg-[rgba(212,160,90,0.08)] !text-[#d4a05a] !border-[rgba(212,160,90,0.3)]"
                      : ""
                  }`}
                >
                  ◎ Tự động
                </button>
                <button
                  onClick={() => {
                    setMode(mode === "auto" ? "deep" : "auto");
                    setResearchArmed(false);
                  }}
                  title="Chế độ thủ công"
                  className={`px-3 py-1 border border-[rgba(255,255,255,0.09)] border-l-0 bg-transparent text-[#52586a] font-mono text-[10px] cursor-pointer transition-all rounded-r-[5px] ${
                    mode !== "auto"
                      ? "!bg-[rgba(139,114,240,0.08)] !text-[#8b72f0] !border-[rgba(139,114,240,0.3)]"
                      : ""
                  }`}
                >
                  ◉ Thủ công
                </button>
              </div>
              {mode !== "auto" && (
                <div className="flex gap-1 ml-1 items-center">
                  <button
                    onClick={() => {
                      setMode("fast");
                      setResearchArmed(false);
                    }}
                    title="Chế độ nhanh (DeepSeek Flash)"
                    className={`px-[10px] py-1 rounded-[5px] border border-[rgba(255,255,255,0.09)] bg-transparent text-[#52586a] font-mono text-[10px] cursor-pointer transition-all ${
                      mode === "fast"
                        ? "!bg-[rgba(0,200,164,0.06)] !text-[#00c8a4] !border-[rgba(0,200,164,0.3)]"
                        : ""
                    }`}
                  >
                    ⚡ Nhanh
                  </button>
                  <button
                    onClick={() => {
                      setMode("deep");
                      setResearchArmed(false);
                    }}
                    title="Chế độ sâu (DeepSeek Pro)"
                    className={`px-[10px] py-1 rounded-[5px] border border-[rgba(255,255,255,0.09)] bg-transparent text-[#52586a] font-mono text-[10px] cursor-pointer transition-all ${
                      mode === "deep"
                        ? "!bg-[rgba(139,114,240,0.08)] !text-[#8b72f0] !border-[rgba(139,114,240,0.3)]"
                        : ""
                    }`}
                  >
                    ◉ Sâu
                  </button>
                </div>
              )}
              {/* Deep Research button */}
              <div className="h-5 w-px bg-[rgba(255,255,255,0.09)] mx-1" />
              <button
                onClick={() => {
                  if (input.trim()) {
                    startResearchV2(input)
                      .then(({ job_id }) => {
                        setResearchJobId(job_id);
                      })
                      .catch(() => {});
                    setInput("");
                    setResearchArmed(false);
                  } else {
                    setResearchArmed(!researchArmed);
                  }
                }}
                title={
                  researchArmed
                    ? "Đã chọn Nghiên cứu sâu — Enter để gửi câu hỏi nghiên cứu"
                    : "Nghiên cứu sâu — AI tự đặt câu hỏi, tìm kiếm, tổng hợp báo cáo"
                }
                disabled={
                  research.phase !== "idle" &&
                  research.phase !== "done" &&
                  research.phase !== "error"
                }
                className={`px-[12px] py-1 rounded-[5px] border font-mono text-[10px] cursor-pointer transition-all flex items-center gap-1 ${
                  research.phase !== "idle" &&
                  research.phase !== "done" &&
                  research.phase !== "error"
                    ? "opacity-50"
                    : ""
                }`}
                style={{
                  borderColor: "rgba(139,114,240,0.3)",
                  background:
                    researchArmed ||
                    (research.phase !== "idle" &&
                      research.phase !== "done" &&
                      research.phase !== "error")
                      ? "rgba(139,114,240,0.12)"
                      : "transparent",
                  color: "#8b72f0",
                }}
                onMouseEnter={(e) => {
                  if (
                    research.phase === "idle" ||
                    research.phase === "done" ||
                    research.phase === "error"
                  ) {
                    e.currentTarget.style.background = "rgba(139,114,240,0.16)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (
                    research.phase === "idle" ||
                    research.phase === "done" ||
                    research.phase === "error"
                  ) {
                    e.currentTarget.style.background = researchArmed
                      ? "rgba(139,114,240,0.12)"
                      : "transparent";
                  }
                }}
              >
                🔬 Nghiên cứu sâu{researchArmed ? " ✓" : ""}
              </button>
            </div>
            {/* Input row */}
            <div className="flex items-end gap-[14px]">
              <textarea
                ref={textareaRef}
                className="flex-1 bg-[#070910] border border-[rgba(255,255,255,0.09)] rounded-[12px] px-4 py-3 text-[#dde2ec] font-body text-[13.5px] resize-none outline-none min-h-[46px] max-h-[130px] transition-colors focus:border-[#00c8a4] placeholder:text-[#52586a] leading-relaxed"
                placeholder={
                  researchArmed
                    ? "Nhập chủ đề nghiên cứu sâu..."
                    : "Hỏi bất cứ điều gì..."
                }
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  handleInput();
                }}
                onKeyDown={handleKeyDown}
              />
              <SendButton
                onClick={() => {
                  if (researchArmed && input.trim()) {
                    handleStartResearch(input);
                    setInput("");
                    setResearchArmed(false);
                  } else {
                    handleSend();
                  }
                }}
                loading={
                  streaming ||
                  research.phase === "planning" ||
                  research.phase === "researching" ||
                  research.phase === "compiling"
                }
                active={
                  streaming ||
                  (research.phase !== "idle" &&
                    research.phase !== "done" &&
                    research.phase !== "error")
                }
                onStop={
                  research.phase === "planning" ||
                  research.phase === "researching" ||
                  research.phase === "compiling"
                    ? stopResearch
                    : undefined
                }
              />
            </div>
            <div className="flex items-center justify-center">
              <span className="font-mono text-[8px] text-[#52586a] opacity-60">
                Enter để gửi · Shift+Enter xuống dòng
              </span>
            </div>
          </div>
        </main>

        {/* ─── Right panel (222px) ───────────────────── */}
        <aside className="w-[222px] flex-shrink-0 bg-[#0c0f18] border-l border-[rgba(255,255,255,0.05)] flex flex-col">
          <div className="px-[14px] pt-[11px] pb-2 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[.12em] text-[#52586a]">
              Ngữ cảnh
            </span>
            <span className="font-mono text-[9px] text-[#00c8a4]">
              trực tiếp
            </span>
          </div>
          <ContextPanel
            skills={activeSkills}
            memories={contextMemories}
            onReviewMemory={() => navigate("/memory")}
            onMemoryClick={(id) => navigate(`/memory?id=${id}`)}
            onEntityClick={(entity) => {
              setInput(`Phân tích về ${entity}`);
              textareaRef.current?.focus();
            }}
          />
        </aside>
      </div>

      {/* Delete session confirm modal */}
      <ConfirmModal
        open={deleteTargetId !== null}
        title="Xóa phiên chat"
        message="Bạn có chắc muốn xóa cuộc trò chuyện này? Hành động này không thể hoàn tác."
        confirmLabel="Xóa"
        onConfirm={confirmDeleteSession}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}
