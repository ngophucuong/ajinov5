import ReactMarkdown from "react-markdown";

interface Props {
  id: string;
  title: string;
  status: "pending" | "running" | "done" | "failed";
  content: string | null;
  expanded: boolean;
  onToggle: () => void;
}

function SectionStatusIcon({ status }: { status: string }) {
  if (status === "done") return <span style={{ color: "#00c8a4" }}>✓</span>;
  if (status === "running")
    return (
      <span
        className="inline-block"
        style={{
          color: "#d4a05a",
          animation: "spin 0.8s linear infinite",
        }}
      >
        ◉
      </span>
    );
  if (status === "failed") return <span style={{ color: "#e06868" }}>✗</span>;
  return <span style={{ color: "rgba(255,255,255,0.15)" }}>○</span>;
}

export default function SectionCard({
  title,
  status,
  content,
  expanded,
  onToggle,
}: Props) {
  const isDone = status === "done";
  const hasContent = isDone && content;

  return (
    <div
      className="rounded-[8px] overflow-hidden"
      style={{
        background: "#0c0f18",
        border: `0.5px solid ${
          status === "running"
            ? "rgba(212,160,90,0.3)"
            : "rgba(255,255,255,0.05)"
        }`,
      }}
    >
      <div
        className="flex items-center gap-2 px-[14px] py-[10px] cursor-pointer select-none transition-colors hover:bg-[rgba(0,200,164,0.04)]"
        onClick={onToggle}
      >
        <SectionStatusIcon status={status} />
        <span
          className="flex-1 text-[12px] font-medium"
          style={{
            color: isDone ? "#dde2ec" : status === "running" ? "#d4a05a" : "#52586a",
          }}
        >
          {title}
        </span>
        {status === "running" && (
          <span className="text-[9px] font-mono" style={{ color: "#d4a05a" }}>
            đang viết...
          </span>
        )}
        {status === "failed" && (
          <span className="text-[9px] font-mono" style={{ color: "#e06868" }}>
            timeout
          </span>
        )}
        <span
          className="text-[10px] transition-transform"
          style={{
            color: "#52586a",
            transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
          }}
        >
          ▼
        </span>
      </div>

      {expanded && hasContent && (
        <div
          className="px-[18px] py-[12px]"
          style={{ borderTop: "0.5px solid rgba(255,255,255,0.05)" }}
        >
          <div
            className="text-[13px] leading-[1.8] prose-sm"
            style={{ color: "#dde2ec" }}
          >
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
