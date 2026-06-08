import { IconArrowUp } from "@tabler/icons-react";
import type { MouseEvent } from "react";

interface Props {
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
}

export default function SendButton({
  onClick,
  disabled,
  loading,
  active = true,
}: Props) {
  const isActive = active || loading;

  return (
    <div className="relative w-[52px] h-[52px] flex-shrink-0 cursor-pointer group/sw">
      {/* Orbital ring 1 */}
      <div
        className="absolute rounded-full border-[1.5px] border-transparent pointer-events-none transition-all duration-500"
        style={{
          inset: "-5px",
          borderTopColor: isActive ? "#00c8a4" : "transparent",
          borderRightColor: isActive ? "rgba(0,200,164,0.28)" : "transparent",
          animation: isActive ? "spin 2.5s linear infinite" : "none",
        }}
      />
      {/* Orbital ring 2 */}
      <div
        className="absolute rounded-full border-[0.5px] border-transparent pointer-events-none transition-all duration-500"
        style={{
          inset: "-11px",
          borderBottomColor: isActive ? "rgba(0,200,164,0.13)" : "transparent",
          borderLeftColor: isActive ? "rgba(0,200,164,0.06)" : "transparent",
          animation: isActive ? "spin 7s linear infinite reverse" : "none",
        }}
      />
      {/* Button core */}
      <button
        onClick={onClick}
        disabled={disabled || loading}
        title="Gửi tin nhắn"
        className="absolute inset-0 rounded-full border-none flex items-center justify-center cursor-pointer text-[20px] z-[1] transition-all duration-200 text-[#030e0a] disabled:opacity-50"
        style={{
          background: "linear-gradient(140deg, #00c8a4 0%, #0094d4 100%)",
        }}
      >
        {loading ? (
          <span className="animate-[spin_0.6s_linear_infinite] text-sm">◉</span>
        ) : (
          <IconArrowUp size={20} stroke={2.5} />
        )}
      </button>
    </div>
  );
}
