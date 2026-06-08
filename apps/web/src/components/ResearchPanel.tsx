import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getResearchStatus } from "../lib/api";
import type {
  ResearchAngles,
  ResearchJobStatus,
  ResearchPlanSection,
} from "../lib/types";
import SectionCard from "./SectionCard";
import { IconFileText } from "@tabler/icons-react";

interface Props {
  jobId: string;
  onClose: () => void;
  onDone?: (
    title: string,
    content: string,
    sectionCount: number,
    documentId: string | null,
  ) => void;
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

function joinItems(values?: string[], limit = 3): string | null {
  if (!values || values.length === 0) return null;
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, limit)
    .join(", ");
}

function AngleInsights({ angles }: { angles?: ResearchAngles | null }) {
  if (!angles) return null;
  const depthLabel =
    angles.action?.recommended_depth === "brief"
      ? "ngắn gọn"
      : angles.action?.recommended_depth === "standard"
        ? "tiêu chuẩn"
        : angles.action?.recommended_depth === "deep"
          ? "chuyên sâu"
          : null;

  const items = [
    {
      icon: "👥",
      label: "Bên liên quan",
      value: joinItems(angles.who?.stakeholders),
    },
    {
      icon: "🎯",
      label: "Mục đích",
      value: angles.why?.underlying_goal?.trim() || null,
    },
    {
      icon: "❓",
      label: "Quyết định",
      value: angles.why?.decision_to_make?.trim() || null,
    },
    {
      icon: "⚠️",
      label: "Điểm mù",
      value: joinItems(angles.risk?.blind_spots, 2),
    },
    {
      icon: "📊",
      label: "Độ sâu",
      value: depthLabel,
    },
  ].filter((item) => item.value);

  if (items.length === 0) return null;

  return (
    <div
      className="rounded-[10px] px-[13px] py-[10px] flex flex-col gap-[5px]"
      style={{
        background: "rgba(139,114,240,0.08)",
        border: "0.5px solid rgba(139,114,240,0.2)",
      }}
    >
      <div
        className="font-mono text-[9px] uppercase tracking-[.1em]"
        style={{ color: C.pu }}
      >
        Ajino đã phân tích từ 7 góc độ
      </div>
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-start gap-[6px] text-[11.5px] leading-[1.4]"
        >
          <span>{item.icon}</span>
          <span
            className="font-mono text-[10px] min-w-[70px] flex-shrink-0"
            style={{ color: C.mu }}
          >
            {item.label}:
          </span>
          <span style={{ color: C.tx }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function SectionOutline({
  section,
  runtimeStatus,
  expanded,
  onToggle,
}: {
  section: ResearchPlanSection;
  runtimeStatus?: "pending" | "running" | "done" | "failed";
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = runtimeStatus || "pending";
  const statusLabel =
    status === "done"
      ? "xong"
      : status === "running"
        ? "đang viết"
        : status === "failed"
          ? "lỗi"
          : "chờ";
  const statusColor =
    status === "done"
      ? C.gr
      : status === "running"
        ? C.am
        : status === "failed"
          ? "#e06868"
          : C.mu;
  const keyQuestions = section.key_questions?.filter(Boolean) || [];
  const previousRefs = section.use_previous_sections?.filter(Boolean) || [];
  const outputFormatLabel =
    section.output_format === "paragraph"
      ? "đoạn văn"
      : section.output_format === "bullets"
        ? "gạch đầu dòng"
        : section.output_format === "table"
          ? "bảng"
          : section.output_format === "mixed"
            ? "hỗn hợp"
            : null;

  return (
    <div
      className="rounded-[8px] overflow-hidden"
      style={{
        background: "#0c0f18",
        border:
          status === "running"
            ? "0.5px solid rgba(212,160,90,0.3)"
            : "0.5px solid rgba(255,255,255,0.05)",
      }}
    >
      <div
        className="flex items-center gap-2 px-[14px] py-[10px] cursor-pointer select-none transition-colors hover:bg-[rgba(139,114,240,0.04)]"
        onClick={onToggle}
      >
        <span
          className="text-[10px] font-mono"
          style={{ color: statusColor, minWidth: 52 }}
        >
          {statusLabel}
        </span>
        <span
          className="flex-1 text-[12px] font-medium"
          style={{ color: C.tx }}
        >
          {section.title}
        </span>
        <span
          className="text-[10px] transition-transform"
          style={{
            color: C.mu,
            transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
          }}
        >
          ▼
        </span>
      </div>

      {expanded && (
        <div
          className="px-[16px] py-[10px] flex flex-col gap-[7px]"
          style={{ borderTop: "0.5px solid rgba(255,255,255,0.05)" }}
        >
          {section.objective && (
            <div className="text-[11px] leading-[1.5]" style={{ color: C.tx }}>
              <span className="font-mono text-[9px] mr-[6px]" style={{ color: C.mu }}>
                mục tiêu
              </span>
              {section.objective}
            </div>
          )}
          {keyQuestions.length > 0 && (
            <div className="flex flex-col gap-[4px]">
              <span
                className="font-mono text-[9px] uppercase tracking-[.08em]"
                style={{ color: C.pu }}
              >
                Câu hỏi trọng tâm
              </span>
              {keyQuestions.map((question) => (
                <div
                  key={question}
                  className="text-[11px] leading-[1.45] pl-[10px] relative"
                  style={{ color: C.tx }}
                >
                  <span
                    className="absolute left-0 top-0"
                    style={{ color: C.pu }}
                  >
                    •
                  </span>
                  {question}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-[6px] text-[9px] font-mono">
            {outputFormatLabel && (
              <span
                className="px-[6px] py-[2px] rounded-[4px]"
                style={{
                  background: "rgba(139,114,240,0.08)",
                  border: "0.5px solid rgba(139,114,240,0.2)",
                  color: C.pu,
                }}
              >
                {outputFormatLabel}
              </span>
            )}
            {section.estimated_words && (
              <span
                className="px-[6px] py-[2px] rounded-[4px]"
                style={{
                  background: "rgba(212,160,90,0.08)",
                  border: "0.5px solid rgba(212,160,90,0.2)",
                  color: C.am,
                }}
              >
                ~{section.estimated_words} từ
              </span>
            )}
            {previousRefs.length > 0 && (
              <span
                className="px-[6px] py-[2px] rounded-[4px]"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "0.5px solid rgba(255,255,255,0.09)",
                  color: C.mu,
                }}
              >
                dùng: {previousRefs.join(", ")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResearchPanel({ jobId, onClose, onDone }: Props) {
  const navigate = useNavigate();
  const [job, setJob] = useState<ResearchJobStatus | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );
  const [expandedOutlineSections, setExpandedOutlineSections] = useState<Set<string>>(
    new Set(),
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (document.hidden) return;
    try {
      const data = await getResearchStatus(jobId);
      setJob(data);

      if (data.sections) {
        setExpandedSections((prev) => {
          const next = new Set(prev);
          for (const section of data.sections) {
            if (section.status === "done") next.add(section.id);
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
            data.document_id,
          );
        }
      }
    } catch {
      // ignore
    }
  }, [jobId, onDone]);

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
  const runtimeStatusMap = new Map(
    job.sections.map((section) => [section.id, section.status]),
  );

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

        {job.angles && job.status !== "done" && <AngleInsights angles={job.angles} />}

        {job.plan?.sections && job.plan.sections.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            <div
              className="font-mono text-[9px] uppercase tracking-[.1em]"
              style={{ color: C.mu }}
            >
              Dàn ý nghiên cứu
            </div>
            {job.plan.sections.map((section) => (
              <SectionOutline
                key={section.id}
                section={section}
                runtimeStatus={runtimeStatusMap.get(section.id)}
                expanded={expandedOutlineSections.has(section.id)}
                onToggle={() =>
                  setExpandedOutlineSections((prev) => {
                    const next = new Set(prev);
                    if (next.has(section.id)) next.delete(section.id);
                    else next.add(section.id);
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}

        {job.sections && job.sections.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            <div
              className="font-mono text-[9px] uppercase tracking-[.1em]"
              style={{ color: C.mu }}
            >
              Nội dung đang tổng hợp
            </div>
            {job.sections.map((section) => (
              <SectionCard
                key={section.id}
                id={section.id}
                title={section.title}
                status={section.status}
                content={section.content}
                expanded={expandedSections.has(section.id)}
                onToggle={() =>
                  setExpandedSections((prev) => {
                    const next = new Set(prev);
                    if (next.has(section.id)) next.delete(section.id);
                    else next.add(section.id);
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
                {job.intent_meta?.estimated_sections || job.sections?.length || 0}{" "}
                phần · đã lưu vào Studio
              </span>
            </div>
            <button
              onClick={() =>
                navigate(
                  job.document_id
                    ? `/studio?doc=${encodeURIComponent(job.document_id)}`
                    : "/studio",
                )
              }
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
