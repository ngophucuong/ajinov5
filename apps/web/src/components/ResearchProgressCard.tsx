import { useNavigate } from "react-router-dom";
import { IconBrain, IconFileText, IconLoader } from "@tabler/icons-react";

// ─── Types ──────────────────────────────────────────
export interface ResearchState {
  phase: "idle" | "planning" | "researching" | "compiling" | "done" | "error";
  topic: string;
  questions: string[];
  currentIndex: number;
  totalQuestions: number;
  currentQuestion: string;
  docId: string | null;
  docTitle: string;
  wordCount: number;
  questionCount: number;
  errorMessage: string;
  elapsedMs: number;
}

interface Props {
  state: ResearchState;
  onNavigateStudio: () => void;
  onClose: () => void;
}

// ─── Color palette ──────────────────────────────────
const C = {
  pu: "#8b72f0",
  pu0: "rgba(139, 114, 240, 0.08)",
  pu1: "rgba(139, 114, 240, 0.15)",
  pu2: "rgba(139, 114, 240, 0.3)",
  bg: "#0c0f18",
  s1: "#12161f",
  b1: "rgba(255,255,255,0.05)",
  b2: "rgba(255,255,255,0.09)",
  tx: "#dde2ec",
  mu: "#52586a",
  gr: "#00c8a4",
  re: "#e06868",
  am: "#d4a05a",
};

function fmtDuration(ms: number): string {
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

export default function ResearchProgressCard({
  state,
  onNavigateStudio,
  onClose,
}: Props) {
  const isActive = state.phase !== "done" && state.phase !== "error" && state.phase !== "idle";
  const progressPct =
    state.totalQuestions > 0
      ? Math.round((state.currentIndex / state.totalQuestions) * 100)
      : 0;

  return (
    <div
      className="rounded-[14px] overflow-hidden max-w-[640px]"
      style={{
        background: C.s1,
        border: `0.5px solid ${C.pu2}`,
        boxShadow: "0 0 24px rgba(139, 114, 240, 0.06)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-[16px] py-[12px]"
        style={{ borderBottom: `0.5px solid ${C.b1}` }}
      >
        <span className="text-[16px]">🔬</span>
        <span
          className="flex-1 text-[13px] font-semibold"
          style={{ color: C.pu }}
        >
          Nghiên cứu sâu
        </span>
        {isActive && (
          <span
            className="w-[6px] h-[6px] rounded-full"
            style={{
              background: C.pu,
              animation: "pulse 1.3s ease-in-out infinite",
            }}
          />
        )}
        {state.phase === "done" && (
          <span className="text-[10px] font-mono" style={{ color: C.gr }}>
            ✓ Hoàn thành
          </span>
        )}
        {state.phase === "error" && (
          <span className="text-[10px] font-mono" style={{ color: C.re }}>
            ✗ Lỗi
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-[16px] py-[12px] flex flex-col gap-[10px]">
        {/* Topic */}
        <div>
          <span
            className="text-[9px] font-mono uppercase tracking-[.1em] block mb-[3px]"
            style={{ color: C.mu }}
          >
            Chủ đề
          </span>
          <span className="text-[13px] leading-snug" style={{ color: C.tx }}>
            {state.topic}
          </span>
        </div>

        {/* Progress bar */}
        {isActive && state.phase !== "planning" && (
          <div className="flex items-center gap-2">
            <div
              className="flex-1 h-[3px] rounded-[2px] overflow-hidden"
              style={{ background: C.b1 }}
            >
              <div
                className="h-full rounded-[2px] transition-all duration-300"
                style={{
                  width: `${progressPct}%`,
                  background: `linear-gradient(90deg, ${C.pu}, ${C.gr})`,
                }}
              />
            </div>
            <span className="text-[9px] font-mono" style={{ color: C.mu }}>
              {state.currentIndex}/{state.totalQuestions}
            </span>
          </div>
        )}

        {/* Phase: planning */}
        {state.phase === "planning" && (
          <div className="flex items-center gap-2">
            <span className="animate-[spin_0.8s_linear_infinite] text-[12px]">
              ◉
            </span>
            <span className="text-[11px] font-mono" style={{ color: C.mu }}>
              Đang lập kế hoạch nghiên cứu...
            </span>
          </div>
        )}

        {/* Phase: researching */}
        {state.phase === "researching" && (
          <div className="flex flex-col gap-[6px]">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono" style={{ color: C.am }}>
                ◉ Đang nghiên cứu
              </span>
              <span className="text-[10px] font-mono" style={{ color: C.mu }}>
                {state.currentIndex}/{state.totalQuestions} câu hỏi
              </span>
            </div>
            {state.currentQuestion && (
              <div
                className="px-[10px] py-[6px] rounded-[6px] text-[11px] leading-relaxed"
                style={{
                  background: C.pu0,
                  border: `0.5px solid ${C.pu2}`,
                  color: C.tx,
                }}
              >
                {state.currentQuestion}
              </div>
            )}
            {/* Question list */}
            {state.questions.length > 0 && (
              <div className="flex flex-col gap-[2px] max-h-[160px] overflow-y-auto">
                {state.questions.map((q, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-[10px] font-mono py-[2px]"
                    style={{
                      color:
                        i < state.currentIndex
                          ? C.mu
                          : i === state.currentIndex
                            ? C.pu
                            : "rgba(255,255,255,0.15)",
                    }}
                  >
                    <span className="w-[14px] text-right flex-shrink-0">
                      {i < state.currentIndex
                        ? "✓"
                        : i === state.currentIndex
                          ? "◉"
                          : "○"}
                    </span>
                    <span className="truncate">{q}</span>
                  </div>
                ))}
              </div>
            )}
            <span className="text-[8px] font-mono" style={{ color: C.mu }}>
              {fmtDuration(state.elapsedMs)}
            </span>
          </div>
        )}

        {/* Phase: compiling */}
        {state.phase === "compiling" && (
          <div className="flex items-center gap-2">
            <span className="animate-[spin_0.8s_linear_infinite] text-[12px]">
              ◉
            </span>
            <span className="text-[11px] font-mono" style={{ color: C.mu }}>
              Đang tổng hợp báo cáo với DeepSeek V4 Pro...
            </span>
          </div>
        )}

        {/* Phase: done */}
        {state.phase === "done" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[14px]">📄</span>
              <div className="flex-1 min-w-0">
                <span
                  className="block text-[12px] font-medium truncate"
                  style={{ color: C.tx }}
                >
                  {state.docTitle}
                </span>
                <span className="text-[9px] font-mono" style={{ color: C.mu }}>
                  {state.wordCount.toLocaleString()} từ ·{" "}
                  {state.questionCount} câu hỏi · DeepSeek V4 Pro ·{" "}
                  {fmtDuration(state.elapsedMs)}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onNavigateStudio}
                className="flex items-center gap-[5px] px-[12px] py-[7px] rounded-[7px] cursor-pointer border-none text-[11px] font-mono transition-all"
                style={{
                  background: C.pu1,
                  color: C.pu,
                }}
              >
                <IconFileText size={14} /> Xem trong Studio
              </button>
              <button
                onClick={onClose}
                className="flex items-center gap-[5px] px-[12px] py-[7px] rounded-[7px] cursor-pointer text-[11px] font-mono transition-all bg-transparent"
                style={{
                  border: `0.5px solid ${C.b2}`,
                  color: C.mu,
                }}
              >
                ✕ Đóng
              </button>
            </div>
          </div>
        )}

        {/* Phase: error */}
        {state.phase === "error" && (
          <div className="flex flex-col gap-2">
            <div
              className="px-[10px] py-[6px] rounded-[6px] text-[11px]"
              style={{
                background: "rgba(224, 104, 104, 0.08)",
                border: "0.5px solid rgba(224,104,104,0.2)",
                color: C.re,
              }}
            >
              {state.errorMessage || "Lỗi không xác định"}
            </div>
            <button
              onClick={onClose}
              className="self-start px-[12px] py-[6px] rounded-[7px] cursor-pointer text-[11px] font-mono bg-transparent"
              style={{
                border: `0.5px solid ${C.b2}`,
                color: C.mu,
              }}
            >
              ✕ Đóng
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
