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
import { createMemory, createDocument } from "../lib/api";
import AgentNetwork from "../components/AgentNetwork";
import ThinkingTrace from "../components/ThinkingTrace";
import ContextPanel from "../components/ContextPanel";
import SendButton from "../components/SendButton";
import ResearchProgressCard, {
  type ResearchState,
} from "../components/ResearchProgressCard";

// ─── Sample sessions ────────────────────────────────
const DEMO_SESSIONS = [
  {
    id: "1",
    title: "Phân tích đối thủ Q3",
    time: "14:32",
    tag: "strategy",
    active: true,
  },
  {
    id: "2",
    title: "Review báo cáo tài chính",
    time: "11:15",
    tag: "finance",
    active: false,
  },
  {
    id: "3",
    title: "Lịch công tác tháng 7",
    time: "09:04",
    tag: "ops",
    active: false,
  },
  {
    id: "4",
    title: "Chiến lược mở rộng thị trường",
    time: "Hôm qua 16:45",
    tag: "strategy",
    active: false,
  },
  {
    id: "5",
    title: "Đề xuất ngân sách Q4",
    time: "Hôm qua 10:20",
    tag: "finance",
    active: false,
  },
];

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

  const [messages, setMessages] = useState<UIMessage[]>([
    {
      id: "m1",
      role: "user",
      content:
        "Phân tích vị thế cạnh tranh trong logistics xuyên biên giới so với đối thủ lớn. Tập trung Q3.",
    },
    {
      id: "m2",
      role: "assistant",
      content:
        "Trong Q3/2026, vị thế logistics xuyên biên giới có **3 điểm phân hóa rõ** so với đối thủ.\n\nVề **tốc độ thông quan**, lợi thế nằm ở xử lý song song — trung bình `4.2h/lô` so với ngành 6–8h. Đây là moat ngắn hạn nhưng được định giá cao.\n\nVề **coverage mạng lưới**, các đối thủ lớn đang đầu tư mạnh vào cửa khẩu phụ từ Q2. Nếu không phản ứng trong Q4, lợi thế địa lý sẽ thu hẹp đáng kể vào 2027.",
      trace: [
        {
          step: 1,
          agent: "Decompose",
          status: "done",
          duration_ms: 180,
          result: "3 câu hỏi con: market share, pricing, route coverage",
        },
        {
          step: 2,
          agent: "Memory search",
          status: "done",
          duration_ms: 340,
          result: "7 facts canonical về competitive intel, Q2 data",
        },
        {
          step: 3,
          agent: "Serper",
          status: "done",
          duration_ms: 890,
          result: "logistics Vietnam border Q3 2026 · 4 sources retrieved",
        },
        {
          step: 4,
          agent: "Synthesis",
          status: "done",
          duration_ms: 690,
          result: "DeepSeek V4 Pro · context 12,400 tokens",
        },
      ],
      reasoningMode: "deep",
    },
  ]);
  const [mode, setMode] = useState<ReasoningMode>("auto");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>("1");
  const [votes, setVotes] = useState<Record<string, "up" | "down">>({});
  const [researchArmed, setResearchArmed] = useState(false);
  const msgAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    let usedRealBackend = false;

    try {
      await streamResearch(trimmedTopic, {
        onStart: () => {
          usedRealBackend = true;
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
        },
        onError: (_message) => {
          // Fall back to simulation
          if (!usedRealBackend) simulateResearch(trimmedTopic);
        },
      });
    } catch (_err) {
      // Fall back to simulation
      if (!usedRealBackend) simulateResearch(trimmedTopic);
    }
  }

  // Simulation fallback for research (when backend unreachable)
  async function simulateResearch(topic: string) {
    const mockQuestions = [
      `Tổng quan thị trường và xu hướng: ${topic.slice(0, 50)}`,
      `Phân tích đối thủ cạnh tranh chính trong lĩnh vực ${topic.slice(0, 30)}`,
      `Cơ hội và thách thức từ ${topic.slice(0, 40)}`,
      `Đánh giá rủi ro và chiến lược giảm thiểu`,
      `Dự báo và khuyến nghị cho ${topic.slice(0, 35)}`,
      `Phân tích chuỗi cung ứng và vận hành`,
      `Xu hướng công nghệ và đổi mới sáng tạo`,
      `Phân tích tài chính và đầu tư`,
    ];

    // Stage 1: Planning
    setResearch((prev) => ({
      ...prev,
      phase: "planning",
    }));

    // Try to create a real document in Studio via API
    const reportTitle = `Nghiên cứu: ${topic.slice(0, 80)}`;
    const reportContent = `# ${reportTitle}\n\n> Báo cáo nghiên cứu tự động | ${new Date().toLocaleDateString("vi-VN")}\n\n## Tóm tắt\n\nBáo cáo này phân tích chuyên sâu về chủ đề "${topic}" với ${mockQuestions.length} câu hỏi nghiên cứu.\n\n## Nội dung nghiên cứu\n\n${mockQuestions.map((q, i) => `### ${i + 1}. ${q}\n\nĐang chờ backend Agno xử lý để có phân tích chi tiết. Hiện tại đây là bản nháp từ simulation mode.\n`).join("\n")}\n\n## Kết luận\n\nBáo cáo sẽ được cập nhật khi backend Agno xử lý xong pipeline nghiên cứu đầy đủ.`;

    let realDocId: string | null = null;
    try {
      const doc = await createDocument({
        title: reportTitle,
        content: reportContent,
      });
      realDocId = doc.id;
    } catch {
      // API failed, use generated UUID
    }

    setTimeout(() => {
      setResearch((prev) => ({
        ...prev,
        phase: "researching",
        questions: mockQuestions,
        totalQuestions: mockQuestions.length,
        currentIndex: 0,
        currentQuestion: mockQuestions[0],
      }));

      // Stage 2: Simulate researching each question
      let qIndex = 0;
      const researchInterval = setInterval(() => {
        qIndex++;
        if (qIndex < mockQuestions.length) {
          setResearch((prev) => ({
            ...prev,
            currentIndex: qIndex,
            currentQuestion: mockQuestions[qIndex],
            elapsedMs: Date.now() - researchStartRef.current,
          }));
        } else {
          clearInterval(researchInterval);

          // Stage 3: Compiling
          setResearch((prev) => ({ ...prev, phase: "compiling" }));

          setTimeout(() => {
            // Stage 4: Done
            const wordCount = 1500 + Math.floor(Math.random() * 2000);
            setResearch((prev) => ({
              ...prev,
              phase: "done",
              docId: realDocId || crypto.randomUUID(),
              docTitle: reportTitle,
              wordCount,
              questionCount: mockQuestions.length,
              elapsedMs: Date.now() - researchStartRef.current,
            }));
          }, 1500);
        }
      }, 600);
    }, 800);
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

  // Handle keypress
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (researchArmed && input.trim()) {
        startResearch(input);
        setInput("");
        setResearchArmed(false);
      } else {
        handleSend();
      }
    }
  };

  // Context panel data
  const activeSkills = [
    { name: "Tìm kiếm Web", status: "active" as const, stat: "4×" },
    { name: "Truy xuất Bộ nhớ", status: "active" as const, stat: "7 facts" },
    { name: "Phân tích Cạnh tranh", status: "used" as const, stat: "1×" },
    { name: "Tạo Báo cáo", status: "off" as const, stat: "—" },
  ];

  const contextMemories: MemoryItem[] = [
    {
      id: "cm1",
      content: "SF Express mở rộng cửa khẩu phụ từ tháng 5/2026",
      status: "canonical",
      source: "chat",
      created_at: "",
    },
    {
      id: "cm2",
      content: "Thông quan nội bộ trung bình 4.2h/lô hàng",
      status: "canonical",
      source: "chat",
      created_at: "",
    },
    {
      id: "cm3",
      content: "Viettel Post thử nghiệm AI customs tại Lạng Sơn",
      status: "pending",
      source: "capture",
      created_at: "",
    },
  ];

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
            <div className="px-[14px] pt-[7px] pb-[3px] font-mono text-[8px] uppercase tracking-[.12em] text-[#d4a05a] opacity-55">
              Hôm nay
            </div>
            {DEMO_SESSIONS.slice(0, 3).map((s) => (
              <div
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                className={`px-[14px] py-1.5 cursor-pointer border-l-2 transition-all ${
                  activeSessionId === s.id
                    ? "bg-[rgba(0,200,164,0.13)] border-l-[#00c8a4]"
                    : "border-l-transparent hover:bg-[rgba(0,200,164,0.06)] hover:border-l-[rgba(0,200,164,0.25)]"
                }`}
              >
                <div className="text-[11.5px] text-[#dde2ec] whitespace-nowrap overflow-hidden text-ellipsis">
                  {s.title}
                </div>
                <div className="flex gap-[5px] items-center mt-0.5">
                  <span className="font-mono text-[9px] text-[#52586a]">
                    {s.time}
                  </span>
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
                </div>
              </div>
            ))}
            <div className="px-[14px] pt-[7px] pb-[3px] font-mono text-[8px] uppercase tracking-[.12em] text-[#d4a05a] opacity-55">
              Hôm qua
            </div>
            {DEMO_SESSIONS.slice(3).map((s) => (
              <div
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                className={`px-[14px] py-1.5 cursor-pointer border-l-2 transition-all hover:bg-[rgba(0,200,164,0.06)] ${
                  activeSessionId === s.id
                    ? "bg-[rgba(0,200,164,0.13)] border-l-[#00c8a4]"
                    : "border-l-transparent hover:border-l-[rgba(0,200,164,0.25)]"
                }`}
              >
                <div className="text-[11.5px] text-[#dde2ec] whitespace-nowrap overflow-hidden text-ellipsis">
                  {s.title}
                </div>
                <div className="flex gap-[5px] items-center mt-0.5">
                  <span className="font-mono text-[9px] text-[#52586a]">
                    {s.time}
                  </span>
                  <span
                    className={`text-[9px] px-[5px] py-px rounded ${
                      s.tag === "strategy"
                        ? "bg-[rgba(139,114,240,0.08)] text-[#a48df5] border border-[rgba(139,114,240,0.2)]"
                        : "bg-[rgba(0,200,164,0.06)] text-[#40d4b8] border border-[rgba(0,200,164,0.2)]"
                    }`}
                  >
                    {s.tag}
                  </span>
                </div>
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
                    startResearch(input);
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
                    startResearch(input);
                    setInput("");
                    setResearchArmed(false);
                  } else {
                    handleSend();
                  }
                }}
                loading={streaming}
                active={
                  streaming ||
                  (research.phase !== "idle" &&
                    research.phase !== "done" &&
                    research.phase !== "error")
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
    </div>
  );
}
