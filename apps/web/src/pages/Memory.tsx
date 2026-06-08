import { useState, useEffect } from "react";
import type { MemoryItem } from "../lib/types";
import { getMemories, updateMemory as apiUpdateMemory } from "../lib/api";
import MemoryReviewPanel from "../components/MemoryReviewPanel";
import { IconBrain, IconFilter } from "@tabler/icons-react";

export default function Memory() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "canonical" | "all">("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMemories();
  }, [filter]);

  async function loadMemories() {
    setLoading(true);
    setError(null);
    try {
      const data = await getMemories({
        status: filter === "all" ? undefined : filter,
        limit: 50,
      });
      setMemories(data);
    } catch (err) {
      setError("Không thể tải dữ liệu bộ nhớ");
      setMemories([]);
    }
    setLoading(false);
  }

  async function handleApprove(id: string) {
    try {
      await apiUpdateMemory(id, { status: "canonical" });
      setMemories((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, status: "canonical" as const } : m,
        ),
      );
    } catch {
      // Optimistic update for demo
      setMemories((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, status: "canonical" as const } : m,
        ),
      );
    }
  }

  async function handleReject(id: string) {
    try {
      await apiUpdateMemory(id, { status: "archived" });
      setMemories((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, status: "archived" as const } : m,
        ),
      );
    } catch {
      setMemories((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, status: "archived" as const } : m,
        ),
      );
    }
  }

  const pendingCount = memories.filter((m) => m.status === "pending").length;
  const canonicalCount = memories.filter(
    (m) => m.status === "canonical",
  ).length;

  return (
    <div className="flex flex-col h-screen">
      {/* Topbar */}
      <header className="h-[46px] bg-[#0c0f18] border-b border-[rgba(255,255,255,0.05)] flex items-center px-4 gap-[10px] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-display text-[26px] font-semibold text-[#00c8a4] leading-none tracking-[-0.03em]">
            A
          </span>
          <div className="flex flex-col leading-none gap-0.5">
            <span className="font-display text-[13px] font-medium text-[#dde2ec] tracking-[0.05em]">
              Ajino
            </span>
            <span className="font-mono text-[8px] text-[#52586a] tracking-[0.12em]">
              v5 · Quản lý Bộ nhớ
            </span>
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex gap-1">
          <button className="w-[30px] h-[30px] rounded-[7px] border border-transparent bg-transparent text-[#52586a] flex items-center justify-center cursor-pointer transition-all hover:bg-[#12161f] hover:border-[rgba(255,255,255,0.05)] hover:text-[#dde2ec] text-[15px]">
            ←
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: stats sidebar */}
        <aside className="w-[230px] flex-shrink-0 bg-[#0c0f18] border-r border-[rgba(255,255,255,0.05)] flex flex-col p-4 gap-4">
          <div>
            <IconBrain size={32} className="text-[#d4a05a] mb-2" />
            <h2 className="font-display text-lg font-semibold text-[#dde2ec]">
              Bộ Nhớ
            </h2>
            <p className="font-mono text-[9px] text-[#52586a] mt-1 uppercase">
              Quản lý tri thức
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#12161f] border border-[rgba(255,255,255,0.05)]">
              <span className="text-[11px] text-[#52586a]">Tổng số</span>
              <span className="font-mono text-sm text-[#dde2ec]">
                {memories.length}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgba(212,160,90,0.06)] border border-[rgba(212,160,90,0.15)]">
              <span className="text-[11px] text-[#d4a05a]">Đã duyệt</span>
              <span className="font-mono text-sm text-[#d4a05a]">
                {canonicalCount}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgba(224,104,104,0.06)] border border-[rgba(224,104,104,0.15)]">
              <span className="text-[11px] text-[#e06868]">Chờ duyệt</span>
              <span className="font-mono text-sm text-[#e06868]">
                {pendingCount}
              </span>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 bg-[#070910] overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-[#dde2ec]">
                {filter === "all"
                  ? "Tất cả bộ nhớ"
                  : filter === "pending"
                    ? "Bộ nhớ chờ duyệt"
                    : "Bộ nhớ đã duyệt"}
              </h3>

              <div className="flex gap-1">
                <button className="flex items-center gap-1 text-[#52586a] text-xs font-mono">
                  <IconFilter size={12} /> Lọc
                </button>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 mb-4">
              {(["all", "pending", "canonical"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded text-[10px] font-mono transition-colors ${
                    filter === f
                      ? "bg-[rgba(0,200,164,0.13)] text-[#00c8a4] border border-[rgba(0,200,164,0.2)]"
                      : "bg-transparent text-[#52586a] border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.09)]"
                  }`}
                >
                  {f === "all"
                    ? "Tất cả"
                    : f === "pending"
                      ? "Chờ duyệt"
                      : "Đã duyệt"}
                </button>
              ))}
            </div>

            {error && (
              <div className="px-4 py-3 rounded-lg bg-[rgba(224,104,104,0.09)] border border-[rgba(224,104,104,0.2)] text-[#e06868] text-xs mb-4">
                {error}
              </div>
            )}

            <MemoryReviewPanel
              memories={memories}
              onApprove={handleApprove}
              onReject={handleReject}
              loading={loading}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
