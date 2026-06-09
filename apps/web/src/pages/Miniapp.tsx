import { useState, useEffect, useRef, useCallback } from "react";
import type {
  AdaptiveModeType,
  ReasoningMode,
  MemoryItem,
  PendingMemorySummary,
  MemorySearchResult,
  ScheduleItem,
  AdaptiveModeResponse,
} from "../lib/types";
import {
  getAdaptiveMode,
  logMiniAppOpen,
  getTelegramSessionId,
  getMemorySummary,
  getPendingMemoriesPaginated,
  searchMemories,
  updateMemory,
  createCapture,
  getTodaySchedule,
  getSchedule,
} from "../lib/api";
import { streamChatMessage } from "../lib/sse";
import { setToken, getToken } from "../lib/auth";

// ─── Telegram WebApp globals ─────────────────────────
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        enableClosingConfirmation: () => void;
        initData: string;
        initDataUnsafe: {
          user?: { id: number; first_name: string; username?: string };
        };
        colorScheme: "light" | "dark";
        viewportHeight: number;
        MainButton: {
          setText: (text: string) => void;
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        HapticFeedback: {
          impactOccurred: (
            style: "light" | "medium" | "heavy" | "rigid" | "soft",
          ) => void;
        };
      };
    };
  }
}

// ─── Types ────────────────────────────────────────────
interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: string;
  isStreaming?: boolean;
}

interface ToastInfo {
  text: string;
  type: "success" | "error" | "info";
}

// ─── Constants ────────────────────────────────────────
const MODE_LABELS: Record<AdaptiveModeType, string> = {
  briefing: "Briefing · Sáng",
  premeeting: "Họp sắp tới",
  capture: "Ghi nhanh",
  chat: "Chat",
  memory: "Memory Review",
};

const REASON_CYCLE: Array<{ key: ReasoningMode; label: string }> = [
  { key: "auto", label: "◎ Auto" },
  { key: "fast", label: "⚡ Fast" },
  { key: "deep", label: "◉ Deep" },
];

// ─── Styles ───────────────────────────────────────────
const C = {
  bg: "#080603",
  s1: "#0e0c09",
  s2: "#161310",
  b1: "rgba(255,255,255,0.05)",
  b2: "rgba(255,255,255,0.09)",
  tx: "#ede8df",
  mu: "#7a7068",
  am: "#c88a3a",
  am0: "rgba(200,138,58,0.08)",
  am1: "rgba(200,138,58,0.16)",
  am2: "rgba(200,138,58,0.32)",
  gr: "#5a9e72",
  gr0: "rgba(90,158,114,0.09)",
  re: "#c45858",
};

function fmtClock(d: Date): string {
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(d: Date): string {
  const days = [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ];
  const day = days[d.getDay()];
  return `${day}, ${d.toLocaleDateString("vi-VN")}`;
}

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} giờ trước`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD} ngày trước`;
}

// ─── Component ────────────────────────────────────────
export default function Miniapp() {
  // Telegram context
  const tg = window.Telegram?.WebApp;
  const tgUser = tg?.initDataUnsafe?.user;
  const telegramId = tgUser ? String(tgUser.id) : "5250339472";
  const userName = tgUser?.first_name || "Cường";

  // State
  const [mode, setMode] = useState<AdaptiveModeType>("chat");
  const [modeReason, setModeReason] = useState<string>("default");
  const [clock, setClock] = useState(fmtClock(new Date()));
  const [toast, setToast] = useState<ToastInfo | null>(null);
  const [openLogged, setOpenLogged] = useState(false);

  // Briefing state
  const [pendingSummary, setPendingSummary] =
    useState<PendingMemorySummary | null>(null);

  // Chat state
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [reasoningIdx, setReasoningIdx] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Memory state
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [memoryOffset, setMemoryOffset] = useState(0);
  const [memoryTotal, setMemoryTotal] = useState(0);

  // Capture state
  const [captureText, setCaptureText] = useState("");
  const [captureTags, setCaptureTags] = useState<string[]>([]);
  const [captureSubmitting, setCaptureSubmitting] = useState(false);

  // Pre-meeting state
  const [contextCards, setContextCards] = useState<MemorySearchResult[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [meetingInfo, setMeetingInfo] =
    useState<AdaptiveModeResponse["meeting"]>(null);
  const [countdown, setCountdown] = useState<{
    min: number;
    sec: number;
  } | null>(null);

  // Refs
  const msgAreaRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const openStartRef = useRef(Date.now());

  // ─── Helpers ────────────────────────────────────────
  function flash(text: string, type: ToastInfo["type"] = "info") {
    setToast({ text, type });
    setTimeout(() => setToast(null), 2500);
  }

  function haptic(style: "light" | "medium" | "heavy" = "light") {
    tg?.HapticFeedback?.impactOccurred(style);
  }

  // ─── Init ───────────────────────────────────────────
  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
      tg.enableClosingConfirmation();
    }

    // Auth via Telegram initData (Mini App không dùng OTP)
    async function auth() {
      if (getToken()) return; // already authenticated
      const initData = tg?.initData || "";
      if (!initData) return;
      try {
        const res = await fetch("/auth/telegram/miniapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ init_data: initData }),
        });
        const body = await res.json();
        if (body.data?.token) {
          setToken(body.data.token);
        }
      } catch {
        // silent — will retry on next API call or reload
      }
    }
    auth();

    // Clock
    const clockInterval = setInterval(
      () => setClock(fmtClock(new Date())),
      30000,
    );
    return () => clearInterval(clockInterval);
  }, []);

  // Detect adaptive mode on mount
  useEffect(() => {
    async function init() {
      try {
        const res = await getAdaptiveMode(telegramId);
        setMode(res.mode);
        setModeReason(res.reason);
        if (res.meeting) setMeetingInfo(res.meeting);
      } catch {
        setMode("chat");
        setModeReason("default");
      }
    }
    init();
  }, [telegramId]);

  // Log open event
  useEffect(() => {
    if (openLogged) return;
    setOpenLogged(true);
    const now = new Date();
    const vnHour = (now.getUTCHours() + 7) % 24;
    logMiniAppOpen({
      telegram_id: telegramId,
      mode_shown: mode,
      vn_hour: vnHour,
      had_meeting_soon: mode === "premeeting" || !!meetingInfo,
      duration_seconds: 0,
    }).catch(() => {});
  }, [mode, telegramId, openLogged]);

  // Log duration on unmount
  useEffect(() => {
    return () => {
      const duration = Math.floor((Date.now() - openStartRef.current) / 1000);
      logMiniAppOpen({
        telegram_id: telegramId,
        mode_shown: mode,
        vn_hour: (new Date().getUTCHours() + 7) % 24,
        had_meeting_soon: false,
        duration_seconds: duration,
      }).catch(() => {});
    };
  }, []);

  // Load session for chat
  useEffect(() => {
    if (mode === "chat" && !sessionId) {
      getTelegramSessionId(telegramId)
        .then((res) => setSessionId(res.session_id))
        .catch(() => {});
    }
  }, [mode, telegramId, sessionId]);

  // Load briefing data (pending summary + schedule)
  useEffect(() => {
    if (mode === "briefing") {
      getMemorySummary()
        .then(setPendingSummary)
        .catch(() => setPendingSummary(null));
      setScheduleLoading(true);
      getTodaySchedule()
        .then((res) => {
          setScheduleItems(res.items || []);
          setScheduleLoading(false);
        })
        .catch(() => {
          setScheduleItems([]);
          setScheduleLoading(false);
        });
    }
  }, [mode]);

  // Load memory items
  useEffect(() => {
    if (mode === "memory") {
      getPendingMemoriesPaginated(memoryOffset)
        .then((items) => {
          setMemoryItems(items);
          getMemorySummary()
            .then((s) => setMemoryTotal(s.count))
            .catch(() => {});
        })
        .catch(() => setMemoryItems([]));
    }
  }, [mode, memoryOffset]);

  // ─── Chat handlers ──────────────────────────────────
  const handleChatSend = useCallback(async () => {
    const content = chatInput.trim();
    if (!content || streaming) return;

    setChatInput("");
    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const aiMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      trace: "Đang xử lý...",
      isStreaming: true,
    };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setStreaming(true);
    haptic("light");

    const sid = sessionId || "new";
    const rmode = REASON_CYCLE[reasoningIdx].key;

    try {
      await streamChatMessage(sid, content, rmode, {
        onTrace: (event) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsg.id
                ? {
                    ...m,
                    trace: `${event.data.agent} · ${event.data.result?.slice(0, 50) || "..."}`,
                  }
                : m,
            ),
          );
        },
        onToken: (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsg.id ? { ...m, content: m.content + delta } : m,
            ),
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsg.id ? { ...m, isStreaming: false } : m,
            ),
          );
          setStreaming(false);
        },
        onError: () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsg.id
                ? {
                    ...m,
                    content: "⚠️ Lỗi kết nối. Thử lại sau.",
                    isStreaming: false,
                  }
                : m,
            ),
          );
          setStreaming(false);
        },
      });
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsg.id
            ? { ...m, content: "⚠️ Lỗi kết nối.", isStreaming: false }
            : m,
        ),
      );
      setStreaming(false);
    }
  }, [chatInput, streaming, sessionId, reasoningIdx]);

  const cycleReasoning = () => {
    setReasoningIdx((idx) => (idx + 1) % REASON_CYCLE.length);
  };

  // ─── Memory handlers ────────────────────────────────
  const handleApproveMemory = async (id: string) => {
    haptic("medium");
    try {
      await updateMemory(id, { status: "canonical" });
      flash("✓ Đã duyệt", "success");
      setMemoryOffset((o) => o + 1);
    } catch {
      flash("Lỗi khi duyệt", "error");
    }
  };

  const handleRejectMemory = async (id: string) => {
    haptic("light");
    try {
      await updateMemory(id, { status: "archived" });
      flash("✓ Đã bỏ", "info");
      setMemoryOffset((o) => o + 1);
    } catch {
      flash("Lỗi", "error");
    }
  };

  const handleSkipMemory = () => {
    setMemoryOffset((o) => o + 1);
  };

  // ─── Capture handlers ───────────────────────────────
  const handleCaptureSubmit = async () => {
    const content = captureText.trim();
    if (!content || captureSubmitting) return;

    setCaptureSubmitting(true);
    try {
      await createCapture({ type: "text", content });
      haptic("medium");
      flash("✓ Đã gửi vào Memory Review", "success");
      setCaptureText("");
      setCaptureTags([]);
    } catch {
      flash("Lỗi khi gửi", "error");
    }
    setCaptureSubmitting(false);
  };

  const toggleTag = (tag: string) => {
    setCaptureTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  // ─── Pre-meeting: load context + countdown ──────────
  useEffect(() => {
    if (mode === "premeeting" && meetingInfo) {
      // Search context based on meeting title
      searchMemories(meetingInfo.title, 3)
        .then(setContextCards)
        .catch(() => setContextCards([]));

      // Start countdown
      const updateCountdown = () => {
        const now = Date.now();
        const target = new Date(meetingInfo.start_time).getTime();
        const diff = Math.max(0, target - now);
        const min = Math.floor(diff / 60000);
        const sec = Math.floor((diff % 60000) / 1000);
        setCountdown({ min, sec });

        // Auto-switch to chat when meeting starts
        if (diff <= 0) {
          setMode("chat");
          setMeetingInfo(null);
        }
      };
      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    }
  }, [mode, meetingInfo]);

  // ─── Save to memory (from chat) ────────────────────
  const handleSaveToMemory = async (content: string) => {
    try {
      await createCapture({ type: "text", content });
      flash("✓ Đã lưu vào Memory Review", "success");
      haptic("light");
    } catch {
      flash("Lỗi khi lưu", "error");
    }
  };

  // ─── Navigate to memory from briefing ───────────────
  const goToMemory = () => {
    setMode("memory");
    setMemoryOffset(0);
  };

  // ─── Scroll to bottom on new messages ────────────────
  useEffect(() => {
    if (msgAreaRef.current) {
      msgAreaRef.current.scrollTop = msgAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // ─── Render ─────────────────────────────────────────
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: C.bg,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
        overflow: "hidden",
        maxWidth: 430,
        margin: "0 auto",
      }}
    >
      {/* ── TOPBAR ─────────────────────────── */}
      <div
        style={{
          height: 52,
          background: C.s1,
          borderBottom: `0.5px solid ${C.b1}`,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 10,
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <span
          style={{
            fontFamily: "'Exo 2', sans-serif",
            fontSize: 22,
            fontWeight: 600,
            color: C.am,
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          A
        </span>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            lineHeight: 1,
            gap: 2,
          }}
        >
          <span
            style={{
              fontFamily: "'Exo 2', sans-serif",
              fontSize: 12,
              fontWeight: 500,
              color: C.tx,
              letterSpacing: ".04em",
            }}
          >
            Ajino
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              color: C.am,
              letterSpacing: ".1em",
              textTransform: "uppercase",
            }}
          >
            {MODE_LABELS[mode] || "Chat"}
          </span>
        </div>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            color: C.mu,
            letterSpacing: ".04em",
          }}
        >
          {clock}
        </span>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: C.gr,
            marginLeft: 4,
          }}
        />
      </div>

      {/* ── CONTENT AREA ───────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {/* ═══ MODE: BRIEFING ════════════════ */}
        {mode === "briefing" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflowY: "auto",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 11,
            }}
          >
            {/* Greeting */}
            <div
              style={{
                background: `linear-gradient(135deg, ${C.s1}, ${C.s2})`,
                border: `0.5px solid ${C.b2}`,
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: C.mu,
                  letterSpacing: ".08em",
                  marginBottom: 5,
                }}
              >
                {clock} · {fmtDate(new Date())}
              </div>
              <div
                style={{
                  fontFamily: "'Exo 2', sans-serif",
                  fontSize: 19,
                  fontWeight: 500,
                  color: C.tx,
                  lineHeight: 1.25,
                }}
              >
                Chào buổi sáng,
                <br />
                <em style={{ color: C.am, fontStyle: "normal" }}>
                  {userName}
                </em>{" "}
                👋
              </div>
            </div>

            {/* Pending memory count */}
            <div
              style={{
                background: C.am0,
                border: `0.5px solid ${C.am2}`,
                borderRadius: 14,
                padding: "12px 14px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: C.am,
                  }}
                />
                <span
                  onClick={goToMemory}
                  style={{
                    marginLeft: "auto",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9,
                    color: C.am,
                    cursor: "pointer",
                  }}
                >
                  Xem tất cả →
                </span>
              </div>
              <div
                style={{
                  fontFamily: "'Exo 2', sans-serif",
                  fontSize: 38,
                  fontWeight: 600,
                  color: C.am,
                  lineHeight: 1,
                }}
              >
                {pendingSummary?.count ?? "..."}
              </div>
              <div style={{ fontSize: 13, color: C.tx, marginTop: 1 }}>
                memory chờ duyệt
              </div>
              {pendingSummary && (
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    color: C.mu,
                    marginTop: 3,
                  }}
                >
                  {pendingSummary.breakdown.chat} từ chat ·{" "}
                  {pendingSummary.breakdown.studio} từ Studio ·{" "}
                  {pendingSummary.breakdown.capture +
                    pendingSummary.breakdown.manual}{" "}
                  thủ công
                </div>
              )}
              <button
                onClick={goToMemory}
                style={{
                  width: "100%",
                  padding: 13,
                  borderRadius: 10,
                  border: `0.5px solid ${C.am2}`,
                  background: C.am,
                  color: "#1a0a02",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  letterSpacing: ".07em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  marginTop: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                🧠 Duyệt ngay
              </button>
            </div>

            {/* Schedule today */}
            <div
              style={{
                background: C.s1,
                border: `0.5px solid ${C.b1}`,
                borderRadius: 14,
                padding: "12px 14px 14px",
              }}
            >
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: C.mu,
                  marginBottom: 8,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Hôm nay</span>
                <span>{new Date().toLocaleDateString("vi-VN")}</span>
              </div>
              {scheduleLoading ? (
                <div
                  style={{
                    fontSize: 13,
                    color: C.mu,
                    textAlign: "center",
                    padding: "10px 0",
                  }}
                >
                  Đang tải...
                </div>
              ) : scheduleItems.length > 0 ? (
                scheduleItems.map((item, i) => (
                  <div
                    key={item.id || i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 0",
                      borderBottom:
                        i < scheduleItems.length - 1
                          ? `0.5px solid ${C.b1}`
                          : "none",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 11,
                        color: C.mu,
                        minWidth: 40,
                      }}
                    >
                      {item.time}
                    </span>
                    <div
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: C.am,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 13, color: C.tx, flex: 1 }}>
                      {item.title}
                    </span>
                    {item.tag && (
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 8,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: C.am0,
                          color: C.am,
                          border: `0.5px solid ${C.am2}`,
                        }}
                      >
                        {item.tag}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div
                  style={{
                    fontSize: 13,
                    color: C.mu,
                    textAlign: "center",
                    padding: "20px 0",
                  }}
                >
                  Chưa có lịch hôm nay
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ MODE: PRE-MEETING ════════════════ */}
        {mode === "premeeting" && meetingInfo && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflowY: "auto",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 11,
            }}
          >
            {/* Meeting card with countdown */}
            <div
              style={{
                background: `linear-gradient(160deg, ${C.am0}, ${C.s1})`,
                border: `0.5px solid ${C.am2}`,
                borderRadius: 14,
                padding: "16px 14px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: C.am,
                }}
              >
                Họp trong
              </div>
              <div
                style={{
                  fontFamily: "'Exo 2', sans-serif",
                  fontSize: 56,
                  fontWeight: 600,
                  color: C.tx,
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  padding: "8px 0 0",
                }}
              >
                {countdown
                  ? `${String(countdown.min).padStart(2, "0")}:${String(countdown.sec).padStart(2, "0")}`
                  : "--:--"}
              </div>
              <div
                style={{
                  fontFamily: "'Exo 2', sans-serif",
                  fontSize: 14,
                  color: C.mu,
                  paddingBottom: 4,
                }}
              >
                phút nữa
              </div>
              {meetingInfo && (
                <>
                  <div
                    style={{
                      fontFamily: "'Exo 2', sans-serif",
                      fontSize: 17,
                      fontWeight: 500,
                      color: C.tx,
                      padding: "12px 14px 2px",
                      textAlign: "center",
                    }}
                  >
                    {meetingInfo.title}
                  </div>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10,
                      color: C.mu,
                      textAlign: "center",
                      padding: "0 14px 14px",
                      letterSpacing: ".04em",
                    }}
                  >
                    {new Date(meetingInfo.start_time).toLocaleTimeString(
                      "vi-VN",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}{" "}
                    · {meetingInfo.duration_min} phút
                  </div>
                </>
              )}
            </div>

            {/* Context cards */}
            <div
              style={{
                background: C.s1,
                border: `0.5px solid ${C.b1}`,
                borderRadius: 14,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: C.mu,
                  marginBottom: 8,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Context liên quan</span>
              </div>
              {contextCards.map((c, i) => (
                <div
                  key={c.id || i}
                  style={{
                    padding: "10px 0",
                    borderBottom:
                      i < contextCards.length - 1
                        ? `0.5px solid ${C.b1}`
                        : "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12.5,
                      color: C.tx,
                      lineHeight: 1.5,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {c.content}
                  </div>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 8,
                      color: C.mu,
                      marginTop: 3,
                      letterSpacing: ".04em",
                    }}
                  >
                    canonical · {c.source} · {fmtRelative(c.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ MODE: CAPTURE ════════════════ */}
        {mode === "capture" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflowY: "auto",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 11,
            }}
          >
            <div
              style={{
                background: C.s1,
                border: `0.5px solid ${C.b2}`,
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontFamily: "'Exo 2', sans-serif",
                  fontSize: 16,
                  fontWeight: 500,
                  color: C.tx,
                }}
              >
                Ghi lại nhanh
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  color: C.mu,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  marginTop: 2,
                }}
              >
                Ý tưởng · quyết định · thông tin quan trọng
              </div>
            </div>

            <div
              style={{
                background: C.s1,
                border: `0.5px solid ${C.b2}`,
                borderRadius: 14,
                padding: 14,
              }}
            >
              <textarea
                value={captureText}
                onChange={(e) => setCaptureText(e.target.value)}
                placeholder={`Gõ nội dung cần ghi lại...\nVD: Mr. Hồ xác nhận kick-off tháng 8, ngân sách tăng lên 2.5 tỷ`}
                style={{
                  width: "100%",
                  minHeight: 130,
                  background: C.s1,
                  border: `0.5px solid ${C.b2}`,
                  borderRadius: 12,
                  padding: 13,
                  color: C.tx,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  lineHeight: 1.6,
                  resize: "none",
                  outline: "none",
                }}
              />
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9,
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: C.mu,
                    marginBottom: 6,
                  }}
                >
                  Gắn nhãn
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Quyết định", "Ý tưởng", "Rủi ro", "Cơ hội", "Họp"].map(
                    (tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        style={{
                          padding: "5px 11px",
                          borderRadius: 20,
                          border: `0.5px solid ${captureTags.includes(tag) ? C.am2 : C.b2}`,
                          background: captureTags.includes(tag) ? C.am1 : C.s2,
                          color: captureTags.includes(tag) ? C.am : C.mu,
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10,
                          cursor: "pointer",
                          letterSpacing: ".03em",
                        }}
                      >
                        {tag}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                background: C.gr0,
                border: "rgba(90,158,114,.25)",
                borderRadius: 14,
                padding: 14,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 16 }}>ℹ️</span>
              <span style={{ fontSize: 12, color: C.tx, lineHeight: 1.4 }}>
                Ajino sẽ tự trích xuất facts và gửi vào{" "}
                <strong style={{ color: C.gr }}>Memory Review</strong> để bạn
                duyệt.
              </span>
            </div>
          </div>
        )}

        {/* ═══ MODE: CHAT ════════════════════ */}
        {mode === "chat" && (
          <div
            ref={msgAreaRef}
            style={{
              position: "absolute",
              inset: 0,
              overflowY: "auto",
              padding: "14px 14px 4px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {messages.map((msg) =>
              msg.role === "user" ? (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: "flex-end",
                    maxWidth: "82%",
                    background: C.s2,
                    border: `0.5px solid ${C.b2}`,
                    borderRadius: "16px 16px 4px 16px",
                    padding: "10px 13px",
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: C.tx,
                  }}
                >
                  {msg.content}
                </div>
              ) : (
                <div
                  key={msg.id}
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {/* Thinking trace */}
                  <div
                    style={{
                      background: C.s1,
                      border: `0.5px solid ${C.b1}`,
                      borderRadius: 8,
                      padding: "8px 11px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Exo 2', sans-serif",
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.am,
                        lineHeight: 1,
                      }}
                    >
                      A
                    </span>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10,
                        color: C.mu,
                        flex: 1,
                        letterSpacing: ".04em",
                      }}
                    >
                      {msg.trace ||
                        (msg.isStreaming
                          ? "Đang xử lý..."
                          : `${REASON_CYCLE[reasoningIdx].label} · done`)}
                    </span>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 8,
                        padding: "2px 6px",
                        borderRadius: 3,
                        background: msg.isStreaming ? C.am0 : C.gr0,
                        color: msg.isStreaming ? C.am : C.gr,
                        border: `0.5px solid ${msg.isStreaming ? C.am2 : "rgba(90,158,114,.18)"}`,
                      }}
                    >
                      {msg.isStreaming ? "running" : "done"}
                    </span>
                  </div>

                  {/* Content */}
                  {msg.content && (
                    <div style={{ fontSize: 14, lineHeight: 1.7, color: C.tx }}>
                      {msg.content}
                    </div>
                  )}

                  {/* Actions */}
                  {!msg.isStreaming && msg.content && (
                    <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
                      <button
                        onClick={() => handleSaveToMemory(msg.content)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 5,
                          border: `0.5px solid ${C.b1}`,
                          background: C.s1,
                          color: C.mu,
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 9,
                          cursor: "pointer",
                        }}
                      >
                        🔖 Lưu
                      </button>
                    </div>
                  )}
                </div>
              ),
            )}

            {messages.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  color: C.mu,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  marginTop: 40,
                }}
              >
                Hỏi Ajino bất cứ điều gì...
              </div>
            )}
          </div>
        )}

        {/* ═══ MODE: MEMORY ════════════════════ */}
        {mode === "memory" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflowY: "auto",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 11,
            }}
          >
            {/* Header */}
            <div
              style={{
                background: C.am0,
                border: `0.5px solid ${C.am2}`,
                borderRadius: 14,
                padding: 20,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "'Exo 2', sans-serif",
                  fontSize: 38,
                  fontWeight: 600,
                  color: C.am,
                  lineHeight: 1,
                }}
              >
                {memoryTotal || "..."}
              </div>
              <div style={{ fontSize: 13, color: C.tx, marginTop: 1 }}>
                memory chờ duyệt
              </div>
            </div>

            {memoryItems.length > 0 ? (
              memoryItems.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    background: C.s1,
                    border: `0.5px solid ${C.b1}`,
                    borderRadius: 14,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9,
                      letterSpacing: ".1em",
                      textTransform: "uppercase",
                      color: C.mu,
                      padding: "12px 14px 0",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>
                      {memoryOffset + idx + 1} / {memoryTotal || "?"}
                    </span>
                    <span>
                      {item.source} · {fmtRelative(item.created_at)}
                    </span>
                  </div>
                  <div style={{ padding: "10px 14px 14px" }}>
                    <div
                      style={{
                        fontSize: 14,
                        lineHeight: 1.6,
                        color: C.tx,
                        marginBottom: 12,
                      }}
                    >
                      {item.content}
                    </div>
                    <div style={{ display: "flex", gap: 7 }}>
                      <button
                        onClick={() => handleApproveMemory(item.id)}
                        style={{
                          flex: 1,
                          padding: 10,
                          borderRadius: 12,
                          border: `0.5px solid ${C.am}`,
                          background: C.am,
                          color: "#1a0a02",
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}
                      >
                        ✓ Duyệt
                      </button>
                      <button
                        onClick={() => handleRejectMemory(item.id)}
                        style={{
                          width: 44,
                          flex: "none",
                          padding: 10,
                          borderRadius: 12,
                          border: `0.5px solid ${C.b2}`,
                          background: C.s2,
                          color: C.tx,
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: 14,
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    <button
                      onClick={handleSkipMemory}
                      style={{
                        width: "100%",
                        padding: 13,
                        borderRadius: 10,
                        border: `0.5px solid ${C.am2}`,
                        background: C.am1,
                        color: C.am,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 11,
                        letterSpacing: ".07em",
                        textTransform: "uppercase",
                        cursor: "pointer",
                        marginTop: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      → Bỏ qua · còn{" "}
                      {Math.max(0, memoryTotal - memoryOffset - 1)}
                    </button>
                  </div>
                </div>
              ))
            ) : memoryTotal === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: C.gr,
                  padding: 30,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                }}
              >
                ✓ Đã duyệt hết 🎉
              </div>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  color: C.mu,
                  padding: 20,
                }}
              >
                Đang tải...
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BOTTOM BAR ──────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          background: C.s1,
          borderTop: `0.5px solid ${C.b1}`,
        }}
      >
        {/* Chat input bar */}
        {mode === "chat" && (
          <div
            style={{
              padding: "10px 12px 12px",
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
            }}
          >
            <button
              onClick={cycleReasoning}
              style={{
                padding: "6px 10px",
                borderRadius: 20,
                border: `0.5px solid ${C.am2}`,
                background: C.am0,
                color: C.am,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                whiteSpace: "nowrap",
                cursor: "pointer",
                flexShrink: 0,
                letterSpacing: ".04em",
              }}
            >
              {REASON_CYCLE[reasoningIdx].label}
            </button>
            <textarea
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => {
                setChatInput(e.target.value);
                const ta = e.target;
                ta.style.height = "auto";
                ta.style.height = Math.min(ta.scrollHeight, 100) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleChatSend();
                }
              }}
              placeholder="Hỏi bất cứ điều gì..."
              rows={1}
              style={{
                flex: 1,
                background: C.s2,
                border: `0.5px solid ${C.b2}`,
                borderRadius: 20,
                padding: "10px 14px",
                color: C.tx,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                outline: "none",
                resize: "none",
                maxHeight: 100,
                minHeight: 40,
                lineHeight: 1.4,
              }}
            />
            <button
              onClick={handleChatSend}
              disabled={streaming}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: C.am,
                border: "none",
                color: "#1a0a02",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
                fontSize: 18,
                opacity: streaming ? 0.5 : 1,
              }}
            >
              ↑
            </button>
          </div>
        )}

        {/* Capture submit bar */}
        {mode === "capture" && (
          <div style={{ padding: "10px 12px 12px", display: "flex", gap: 8 }}>
            <button
              onClick={handleCaptureSubmit}
              disabled={captureSubmitting || !captureText.trim()}
              style={{
                flex: 1,
                padding: 13,
                borderRadius: 12,
                border: `0.5px solid ${C.am}`,
                background: C.am,
                color: "#1a0a02",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                cursor:
                  captureSubmitting || !captureText.trim()
                    ? "not-allowed"
                    : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: captureSubmitting || !captureText.trim() ? 0.5 : 1,
              }}
            >
              🧠 Gửi vào Memory Review
            </button>
          </div>
        )}

        {/* Action bar (briefing, premeeting, memory) */}
        {mode !== "chat" && mode !== "capture" && (
          <div style={{ padding: "10px 12px 12px", display: "flex", gap: 8 }}>
            <button
              onClick={() => setMode("chat")}
              style={{
                flex: 1,
                padding: 13,
                borderRadius: 12,
                border: `0.5px solid ${C.b2}`,
                background: C.s2,
                color: C.tx,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              💬 Hỏi Ajino
            </button>
            <button
              onClick={() => setMode("capture")}
              style={{
                flex: 1,
                padding: 13,
                borderRadius: 12,
                border: `0.5px solid ${C.am}`,
                background: C.am,
                color: "#1a0a02",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              ⚡ Ghi nhanh
            </button>
          </div>
        )}

        {/* Bottom tabs */}
        <div
          style={{
            display: "flex",
            borderTop: `0.5px solid ${C.b1}`,
            paddingBottom: "env(safe-area-inset-bottom, 8px)",
          }}
        >
          {(["chat", "memory", "capture"] as const).map((tab) => (
            <div
              key={tab}
              onClick={() => {
                setMode(tab);
                if (tab === "memory") setMemoryOffset(0);
                haptic("light");
              }}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                padding: "8px 0 6px",
                cursor: "pointer",
                position: "relative",
              }}
            >
              <span
                style={{
                  fontSize: 20,
                  color: mode === tab ? C.am : C.mu,
                }}
              >
                {tab === "chat" ? "💬" : tab === "memory" ? "🧠" : "⚡"}
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  color: mode === tab ? C.am : C.mu,
                  letterSpacing: ".03em",
                }}
              >
                {tab === "chat"
                  ? "Chat"
                  : tab === "memory"
                    ? "Bộ nhớ"
                    : "Ghi nhanh"}
              </span>
              {tab === "memory" &&
                pendingSummary &&
                pendingSummary.count > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: 6,
                      right: "calc(50% - 16px)",
                      background: C.re,
                      color: "#fff",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 8,
                      padding: "1px 4px",
                      borderRadius: 6,
                      minWidth: 14,
                      textAlign: "center",
                    }}
                  >
                    {pendingSummary.count}
                  </span>
                )}
            </div>
          ))}
        </div>
      </div>

      {/* ── TOAST ───────────────────────────── */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 100,
            left: "50%",
            transform: "translateX(-50%)",
            background:
              toast.type === "success"
                ? C.gr0
                : toast.type === "error"
                  ? "rgba(196,88,88,0.9)"
                  : C.am1,
            color:
              toast.type === "success"
                ? C.gr
                : toast.type === "error"
                  ? "#fff"
                  : C.am,
            border: `0.5px solid ${toast.type === "success" ? "rgba(90,158,114,.25)" : toast.type === "error" ? C.re : C.am2}`,
            borderRadius: 10,
            padding: "8px 16px",
            fontSize: 12,
            fontFamily: "'DM Sans', sans-serif",
            zIndex: 100,
            whiteSpace: "nowrap",
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
