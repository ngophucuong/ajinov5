interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Xác nhận",
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onCancel}
    >
      <div
        className="rounded-lg p-6 min-w-[320px] flex flex-col gap-4"
        style={{
          background: "#12161f",
          border: "0.5px solid rgba(255,255,255,0.09)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className="text-[14px] font-medium"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            color: "#dde2ec",
          }}
        >
          {title}
        </span>
        <span
          className="text-[12px] leading-relaxed"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            color: "#52586a",
          }}
        >
          {message}
        </span>
        <div className="flex gap-2 justify-end mt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-[6px] text-[11px] font-mono cursor-pointer bg-transparent border border-[rgba(255,255,255,0.09)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
            style={{ color: "#52586a" }}
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-[6px] text-[11px] font-mono cursor-pointer border-none transition-colors"
            style={{
              background: "rgba(224,104,104,0.12)",
              color: "#e06868",
              border: "0.5px solid rgba(224,104,104,0.3)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(224,104,104,0.22)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(224,104,104,0.12)";
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
