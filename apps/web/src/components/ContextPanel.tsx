import type { MemoryItem } from "../lib/types";

interface Props {
  skills: Array<{
    name: string;
    status: "active" | "used" | "off";
    stat?: string;
  }>;
  memories?: MemoryItem[];
  onReviewMemory?: () => void;
  onMemoryClick?: (id: string) => void;
  onEntityClick?: (entity: string) => void;
}

// ─── Skill dot ───────────────────────────────────────
function SkillDot({ status }: { status: "active" | "used" | "off" }) {
  const color =
    status === "active"
      ? "bg-[#00c8a4] animate-[pulse_2s_ease-in-out_infinite]"
      : status === "used"
        ? "bg-[#d4a05a]"
        : "border border-[rgba(255,255,255,0.05)] bg-transparent";
  return (
    <div className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${color}`} />
  );
}

export default function ContextPanel({
  skills,
  memories,
  onReviewMemory,
  onMemoryClick,
  onEntityClick,
}: Props) {
  return (
    <div className="flex-1 overflow-y-auto py-[10px] flex flex-col">
      {/* Skills section */}
      <div className="px-[14px] pb-[13px]">
        <div className="flex items-center justify-between mb-[7px]">
          <span className="font-mono text-[9px] uppercase tracking-[.1em] text-[#d4a05a] opacity-80">
            Kỹ năng hoạt động
          </span>
          <span className="font-mono text-[9px] text-[#00c8a4]">
            {skills.filter((s) => s.status !== "off").length} bật
          </span>
        </div>
        {skills.map((skill, i) => (
          <div
            key={i}
            className={`flex items-center gap-[7px] py-[5px] ${
              i < skills.length - 1
                ? "border-b border-[rgba(255,255,255,0.05)]"
                : ""
            }`}
          >
            <SkillDot status={skill.status} />
            <span className="flex-1 text-[11.5px] text-[#dde2ec]">
              {skill.name}
            </span>
            <span className="font-mono text-[9px] text-[#52586a]">
              {skill.stat || "—"}
            </span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="mx-[14px] h-px bg-[rgba(255,255,255,0.05)] mb-[13px]" />

      {/* Memory section */}
      {memories && memories.length > 0 && (
        <>
          <div className="px-[14px] pb-[13px]">
            <div className="flex items-center justify-between mb-[7px]">
              <span className="font-mono text-[9px] uppercase tracking-[.1em] text-[#d4a05a] opacity-80">
                Bộ nhớ đã nạp
              </span>
              {onReviewMemory && (
                <span
                  className="font-mono text-[9px] text-[#d4a05a] cursor-pointer hover:opacity-80"
                  onClick={onReviewMemory}
                >
                  xem lại →
                </span>
              )}
            </div>
            {memories.map((mem, i) => (
              <div
                key={mem.id || i}
                onClick={() => onMemoryClick?.(mem.id)}
                className={`py-[7px] cursor-pointer flex flex-col gap-[3px] ${
                  i < memories.length - 1
                    ? "border-b border-[rgba(255,255,255,0.05)]"
                    : ""
                }`}
              >
                <span
                  className={`font-mono text-[8px] px-[5px] py-px rounded w-fit ${
                    mem.status === "canonical"
                      ? "bg-[rgba(212,160,90,0.08)] text-[#d4a05a] border border-[rgba(212,160,90,0.2)]"
                      : "bg-[rgba(224,104,104,0.09)] text-[#e06868] border border-[rgba(224,104,104,0.2)]"
                  }`}
                >
                  {mem.status === "canonical" ? "đã duyệt" : "chờ duyệt"}
                </span>
                <span className="text-[11px] text-[#52586a] leading-snug line-clamp-2 transition-colors hover:text-[#dde2ec]">
                  {mem.content}
                </span>
              </div>
            ))}
          </div>

          <div className="mx-[14px] h-px bg-[rgba(255,255,255,0.05)] mb-[13px]" />
        </>
      )}

      {/* Entities section */}
      <div className="px-[14px] pb-[13px]">
        <span className="font-mono text-[9px] uppercase tracking-[.1em] text-[#d4a05a] opacity-80 block mb-[7px]">
          Thực thể
        </span>
        <div className="flex flex-wrap gap-1">
          <span
            onClick={() => onEntityClick?.("SF Express")}
            className="inline-flex items-center gap-[3px] px-[7px] py-[3px] rounded text-[10px] bg-[#12161f] border border-[rgba(255,255,255,0.05)] text-[#52586a] cursor-pointer hover:border-[rgba(255,255,255,0.09)] hover:text-[#dde2ec] transition-colors"
          >
            🏢 SF Express
          </span>
          <span
            onClick={() => onEntityClick?.("Viettel Post")}
            className="inline-flex items-center gap-[3px] px-[7px] py-[3px] rounded text-[10px] bg-[#12161f] border border-[rgba(255,255,255,0.05)] text-[#52586a] cursor-pointer hover:border-[rgba(255,255,255,0.09)] hover:text-[#dde2ec] transition-colors"
          >
            🏢 Viettel Post
          </span>
          <span
            onClick={() => onEntityClick?.("Lạng Sơn")}
            className="inline-flex items-center gap-[3px] px-[7px] py-[3px] rounded text-[10px] bg-[#12161f] border border-[rgba(255,255,255,0.05)] text-[#52586a] cursor-pointer hover:border-[rgba(255,255,255,0.09)] hover:text-[#dde2ec] transition-colors"
          >
            📍 Lạng Sơn
          </span>
        </div>
      </div>
    </div>
  );
}
