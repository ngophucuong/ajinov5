import type { MemoryItem } from "../lib/types";
import { IconBrain, IconCheck } from "@tabler/icons-react";

interface Props {
  memories: MemoryItem[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  loading?: boolean;
}

export default function MemoryReviewPanel({ memories, onApprove, onReject, loading }: Props) {
  if (loading) {
    return (
      <div className="p-4 text-center text-[#52586a] text-xs font-mono">
        Đang tải bộ nhớ...
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="p-4 text-center text-[#52586a] text-xs font-mono">
        <IconBrain size={28} className="mx-auto mb-2 opacity-30" />
        Chưa có bộ nhớ nào chờ duyệt
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {memories.map((mem) => (
        <div
          key={mem.id}
          className="py-[7px] px-[14px] flex flex-col gap-[3px] border-b border-[rgba(255,255,255,0.05)] last:border-b-0"
        >
          <div className="flex items-center gap-2">
            <span
              className={`font-mono text-[8px] px-[5px] py-px rounded w-fit ${
                mem.status === "canonical"
                  ? "bg-[rgba(212,160,90,0.08)] text-[#d4a05a] border border-[rgba(212,160,90,0.2)]"
                  : "bg-[rgba(224,104,104,0.09)] text-[#e06868] border border-[rgba(224,104,104,0.2)]"
              }`}
            >
              {mem.status === "canonical" ? "đã duyệt" : "chờ duyệt"}
            </span>
            <span className="font-mono text-[9px] text-[#52586a] ml-auto">
              {mem.source === "chat" ? "💬 chat" : mem.source === "capture" ? "📷 capture" : mem.source === "studio" ? "📄 studio" : "✍️ thủ công"}
            </span>
          </div>
          <p className="text-[11px] text-[#dde2ec] leading-snug">{mem.content}</p>
          {mem.status === "pending" && (
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => onApprove?.(mem.id)}
                className="inline-flex items-center gap-1 px-[9px] py-[4px] rounded text-[10px] font-mono border border-[rgba(212,160,90,0.3)] bg-[rgba(212,160,90,0.08)] text-[#d4a05a] hover:bg-[rgba(212,160,90,0.14)] transition-colors"
              >
                <IconCheck size={11} /> Duyệt
              </button>
              <button
                onClick={() => onReject?.(mem.id)}
                className="inline-flex items-center gap-1 px-[9px] py-[4px] rounded text-[10px] font-mono border border-[rgba(224,104,104,0.3)] bg-[rgba(224,104,104,0.09)] text-[#e06868] hover:bg-[rgba(224,104,104,0.15)] transition-colors"
              >
                ✕ Từ chối
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
