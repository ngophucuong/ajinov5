import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import type { ThinkingTraceStep, ReasoningMode } from "../lib/types";

interface Props {
  steps: ThinkingTraceStep[];
  reasoningMode: ReasoningMode;
  isStreaming?: boolean;
  elapsedMs?: number;
}

// ─── Reasoning mode badge ──────────────────────────
function ModeBadge({ mode }: { mode: ReasoningMode }) {
  const cls =
    mode === "deep"
      ? "bg-[rgba(139,114,240,0.08)] text-[#8b72f0] border-[rgba(139,114,240,0.2)]"
      : mode === "auto"
        ? "bg-[rgba(212,160,90,0.08)] text-[#d4a05a] border-[rgba(212,160,90,0.2)]"
        : "bg-[rgba(0,200,164,0.06)] text-[#00c8a4] border-[rgba(0,200,164,0.2)]";
  const label =
    mode === "deep" ? "◉ Deep" : mode === "auto" ? "◎ Auto" : "⚡ Fast";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono tracking-wider border ${cls}`}
      style={{ letterSpacing: "0.03em" }}
    >
      {label}
    </span>
  );
}

export default function ThinkingTrace({
  steps,
  reasoningMode,
  isStreaming,
  elapsedMs,
}: Props) {
  const [open, setOpen] = useState(true);

  const totalMs = Array.isArray(steps)
    ? steps.reduce((sum, s) => sum + (s.duration_ms || 0), 0)
    : 0;
  const totalSec = elapsedMs
    ? (elapsedMs / 1000).toFixed(1)
    : (totalMs / 1000).toFixed(1);

  return (
    <div
      className="rounded-[10px] overflow-hidden"
      style={{
        background: "var(--s1, #0c0f18)",
        border: "0.5px solid rgba(255,255,255,0.05)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-[13px] py-[9px] cursor-pointer select-none transition-colors hover:bg-[rgba(0,200,164,0.06)]"
        onClick={() => setOpen(!open)}
      >
        <span
          className={`font-display text-sm font-semibold text-[#00c8a4] leading-none ${isStreaming ? "animate-[pulse_1.3s_ease-in-out_infinite]" : ""}`}
        >
          A
        </span>
        <span className="flex-1 text-[10px] font-mono text-[#52586a] tracking-wider">
          {isStreaming
            ? steps.length > 0
              ? `Suy nghĩ · ${steps.length} bước · ${totalSec}s`
              : "Đang phân tích..."
            : `Đã suy nghĩ · ${steps.length} bước · ${totalSec}s`}
        </span>
        <ModeBadge mode={reasoningMode} />
        {isStreaming ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono bg-[rgba(212,160,90,0.08)] text-[#d4a05a] border border-[rgba(212,160,90,0.2)]">
            đang chạy
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono bg-[rgba(0,200,164,0.06)] text-[#00c8a4] border border-[rgba(0,200,164,0.2)]">
            xong
          </span>
        )}
        <IconChevronDown
          size={14}
          className="text-[#52586a] transition-transform"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
      </div>

      {/* Body */}
      {open && steps.length > 0 && (
        <div
          className="px-[13px] py-[10px] flex flex-col gap-[7px]"
          style={{ borderTop: "0.5px solid rgba(255,255,255,0.05)" }}
        >
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-[11px] font-mono"
            >
              <span
                className={`flex-shrink-0 leading-relaxed ${
                  step.status === "done"
                    ? "text-[#00c8a4]"
                    : step.status === "running"
                      ? "text-[#d4a05a] animate-[pulse_1s_ease-in-out_infinite]"
                      : "text-[#e06868]"
                }`}
              >
                {step.status === "done"
                  ? "✓"
                  : step.status === "running"
                    ? "◉"
                    : "✗"}
              </span>
              <span className="flex-1 text-[#52586a] leading-relaxed">
                {step.agent}
                {" → "}
                <em className="not-italic text-[#dde2ec]">{step.result}</em>
              </span>
              <span
                className="text-[9px] whitespace-nowrap"
                style={{ color: "rgba(255,255,255,0.15)" }}
              >
                {step.duration_ms}ms
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
