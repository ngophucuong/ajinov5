import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getResearchStatus } from "../lib/api";
import type { ResearchJobStatus } from "../lib/types";
import SectionCard from "./SectionCard";
import { IconFileText } from "@tabler/icons-react";

interface Props {
  jobId: string;
  onClose: () => void;
  onDone?: (title: string, content: string, sectionCount: number) => void;
}

const C = {
  pu: "#8b72f0",
  bg: "#0c0f18",
  s1: "#12161f",
  b1: "rgba(255,255,255,0.05)",
  tx: "#dde2ec",
  mu: "#52586a",
  gr: "#00c8a4",
  am: "#d4a05a",
};

export default function ResearchPanel({ jobId, onClose, onDone }: Props) {
  const navigate = useNavigate();
  const [job, setJob] = useState<ResearchJobStatus | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (document.hidden) return;
    try {
      const data = await getResearchStatus(jobId);
      setJob(data);

      // Auto-expand newly done sections
      if (data.sections) {
        setExpandedSections((prev) => {
          const next = new Set(prev);
          for (const s of data.sections) {
            if (s.status === "done") next.add(s.id);
          }
          return next;
        });
      }

      // Stop polling when done or failed
      if (data.status === "done" || data.status === "failed") {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        // Call onDone with compiled content
        if (data.status === "done" && onDone) {
          const fullContent =
            data.sections?.map((s) => s.content || "").join("\n\n") || "";
          onDone(
            data.plan_title || "Nghiên cứu sâu",
            fullContent,
            data.sections?.length || 0,
          );
        }
      }
    } catch {
      // ignore
    }
  }, [jobId]);

  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 3000);

    // Resume on visibility change
    const onVisible = () => poll();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  if (!job) {
    return (
      <div
        className="rounded-[14px] overflow-hidden max-w-[640px]"
        style={{
          background: C.s1,
          border: "0.5px solid rgba(139,114,240,0.3)",
        }}
      >
        <div
          className="px-[16px] py-[12px] text-center"
          style={{
            color: C.mu,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
          }}
        >
          Đang kết nối...
        </div>
      </div>
    );
  }

  const isActive =
    job.status !== "done" && job.status !== "failed" && job.status !== "queued";
  const progressPct = job.progress || 0;

  return (
    <div
      className="rounded-[14px] overflow-hidden max-w-[700px]"
      style={{
        background: C.s1,
        border: `0.5px solid rgba(139,114,240,0.3)`,
        boxShadow: "0 0 24px rgba(139,114,240,0.06)",
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
          {job.plan_title || "Nghiên cứu sâu"}
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
        {job.status === "done" && (
          <span className="text-[10px] font-mono" style={{ color: C.gr }}>
            ✓ Hoàn thành
          </span>
        )}
        {job.status === "failed" && (
          <span className="text-[10px] font-mono" style={{ color: "#e06868" }}>
            ✗ Lỗi
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-[16px] py-[12px] flex flex-col gap-[10px]">
        {/* Progress bar */}
        {isActive && (
          <>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 h-[4px] rounded-[2px] overflow-hidden"
                style={{ background: C.b1 }}
              >
                <div
                  className="h-full rounded-[2px] transition-all duration-700"
                  style={{
                    width: `${progressPct}%`,
                    background: `linear-gradient(90deg, ${C.pu}, ${C.gr})`,
                  }}
                />
              </div>
              <span className="text-[9px] font-mono" style={{ color: C.mu }}>
                {progressPct}%
              </span>
            </div>
            <span className="text-[10px] font-mono" style={{ color: C.am }}>
              {job.current_step}
            </span>
          </>
        )}

        {/* Error */}
        {job.error && (
          <div
            className="px-[10px] py-[6px] rounded-[6px] text-[11px]"
            style={{
              background: "rgba(224,104,104,0.08)",
              border: "0.5px solid rgba(224,104,104,0.2)",
              color: "#e06868",
            }}
          >
            {job.error}
          </div>
        )}

        {/* Sections */}
        {job.sections && job.sections.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            {job.sections.map((s) => (
              <SectionCard
                key={s.id}
                id={s.id}
                title={s.title}
                status={s.status}
                content={s.content}
                expanded={expandedSections.has(s.id)}
                onToggle={() =>
                  setExpandedSections((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}

        {/* Done bar */}
        {job.status === "done" && (
          <div
            className="flex items-center gap-3 mt-1 px-[5px] py-[8px] rounded-[8px]"
            style={{
              background: "rgba(0,200,164,0.06)",
              border: "0.5px solid rgba(0,200,164,0.15)",
            }}
          >
            <span style={{ fontSize: 18 }}>📄</span>
            <div className="flex-1 min-w-0">
              <span
                className="block text-[12px] font-medium"
                style={{ color: C.tx }}
              >
                Báo cáo đã hoàn thành
              </span>
              <span className="text-[9px] font-mono" style={{ color: C.mu }}>
                {job.sections?.length || 0} sections · đã lưu vào Studio
              </span>
            </div>
            <button
              onClick={() => navigate("/studio")}
              className="flex items-center gap-[5px] px-[10px] py-[6px] rounded-[7px] cursor-pointer border-none text-[11px] font-mono transition-all"
              style={{ background: "rgba(139,114,240,0.15)", color: C.pu }}
            >
              <IconFileText size={14} /> Studio
            </button>
            <button
              onClick={onClose}
              className="px-[10px] py-[6px] rounded-[7px] cursor-pointer text-[11px] font-mono bg-transparent"
              style={{
                border: "0.5px solid rgba(255,255,255,0.09)",
                color: C.mu,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Close button when running */}
        {isActive && (
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-[10px] py-[5px] rounded-[5px] cursor-pointer text-[10px] font-mono bg-transparent"
              style={{
                border: "0.5px solid rgba(255,255,255,0.09)",
                color: C.mu,
              }}
            >
              ✕ Ẩn (vẫn chạy nền)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
