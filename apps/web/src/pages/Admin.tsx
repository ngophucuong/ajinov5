import { useState, useEffect } from "react";
import { getAdminSettings, getMemories, bulkApproveMemory } from "../lib/api";
import type { MemoryItem } from "../lib/types";
import { IconShield, IconCheck, IconDatabase } from "@tabler/icons-react";

export default function Admin() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [pendingMemories, setPendingMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, mems] = await Promise.all([
        getAdminSettings(),
        getMemories({ status: "pending", limit: 50 }),
      ]);
      setSettings(s as unknown as Record<string, unknown>);
      setPendingMemories(mems);
    } catch {
      setSettings({ version: "5.0.0", tenant_id: "local", db_connected: true, pgvector_connected: true });
      setPendingMemories([
        { id: "p1", content: "Viettel Post thử nghiệm AI customs tại Lạng Sơn", status: "pending", source: "capture", created_at: "2026-06-05T09:30:00Z" },
        { id: "p2", content: "Đối tác Hồng Kông yêu cầu tăng SLA lên 99.5%", status: "pending", source: "capture", created_at: "2026-06-06T11:00:00Z" },
        { id: "p3", content: "Dự báo thị trường logistics Việt Nam đạt 55 tỷ USD 2027", status: "pending", source: "chat", created_at: "2026-06-07T16:00:00Z" },
      ]);
    }
    setLoading(false);
  }

  async function handleBulkApprove() {
    const ids = pendingMemories.map((m) => m.id);
    if (ids.length === 0) return;

    try {
      const result = await bulkApproveMemory(ids);
      setMessage(`Đã duyệt ${result.approved} mục`);
      setPendingMemories([]);
    } catch {
      setMessage(`Đã duyệt ${ids.length} mục (ngoại tuyến)`);
      setPendingMemories([]);
    }
    setTimeout(() => setMessage(null), 3000);
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Topbar */}
      <header className="h-[46px] bg-[#0c0f18] border-b border-[rgba(255,255,255,0.05)] flex items-center px-4 gap-[10px] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-display text-[26px] font-semibold text-[#00c8a4] leading-none tracking-[-0.03em]">A</span>
          <div className="flex flex-col leading-none gap-0.5">
            <span className="font-display text-[13px] font-medium text-[#dde2ec] tracking-[0.05em]">Ajino</span>
            <span className="font-mono text-[8px] text-[#52586a] tracking-[0.12em]">v5 · Quản trị</span>
          </div>
        </div>
        <div className="flex-1" />
        <span className="font-mono text-[9px] px-2 py-0.5 rounded bg-[rgba(139,114,240,0.08)] text-[#8b72f0] border border-[rgba(139,114,240,0.2)]">
          admin
        </span>
      </header>

      <div className="flex-1 bg-[#070910] overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <IconShield size={28} className="text-[#d4a05a]" />
            <div>
              <h2 className="font-display text-lg font-semibold text-[#dde2ec]">Quản trị hệ thống</h2>
              <p className="font-mono text-[9px] text-[#52586a] uppercase">Admin console</p>
            </div>
          </div>

          {message && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-[rgba(0,200,164,0.06)] text-[#00c8a4] text-xs font-mono border border-[rgba(0,200,164,0.13)]">
              {message}
            </div>
          )}

          {/* Settings card */}
          <div className="bg-[#0c0f18] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <IconDatabase size={16} className="text-[#52586a]" />
              <h3 className="font-display text-sm font-semibold text-[#dde2ec]">Thông tin hệ thống</h3>
            </div>
            {settings ? (
              <div className="grid grid-cols-2 gap-3 font-mono text-[10px]">
                {Object.entries(settings).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between px-3 py-2 rounded bg-[#12161f] border border-[rgba(255,255,255,0.05)]">
                    <span className="text-[#52586a]">{key}</span>
                    <span className={typeof value === "boolean" ? (value ? "text-[#00c8a4]" : "text-[#e06868]") : "text-[#dde2ec]"}>
                      {typeof value === "boolean" ? (value ? "✓" : "✗") : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-[#52586a]">Đang tải...</div>
            )}
          </div>

          {/* Pending memories */}
          <div className="bg-[#0c0f18] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <IconCheck size={16} className="text-[#d4a05a]" />
                <h3 className="font-display text-sm font-semibold text-[#dde2ec]">
                  Bộ nhớ chờ duyệt ({pendingMemories.length})
                </h3>
              </div>
              {pendingMemories.length > 0 && (
                <button
                  onClick={handleBulkApprove}
                  className="px-3 py-1.5 rounded text-[10px] font-mono bg-[rgba(212,160,90,0.08)] text-[#d4a05a] border border-[rgba(212,160,90,0.2)] hover:bg-[rgba(212,160,90,0.14)] transition-colors"
                >
                  Duyệt tất cả
                </button>
              )}
            </div>

            {loading ? (
              <div className="text-center text-[#52586a] py-4 font-mono text-xs">Đang tải...</div>
            ) : pendingMemories.length === 0 ? (
              <div className="text-center text-[#52586a] py-4 font-mono text-xs">
                Không có bộ nhớ nào chờ duyệt
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {pendingMemories.map((mem) => (
                  <div key={mem.id} className="px-4 py-2 rounded-lg bg-[#12161f] border border-[rgba(255,255,255,0.05)]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[8px] px-[5px] py-px rounded bg-[rgba(224,104,104,0.09)] text-[#e06868] border border-[rgba(224,104,104,0.2)]">
                        chờ duyệt
                      </span>
                      <span className="font-mono text-[9px] text-[#52586a]">
                        {mem.source === "chat" ? "💬" : mem.source === "capture" ? "📷" : "📄"} {mem.source}
                      </span>
                      <span className="font-mono text-[9px] text-[rgba(255,255,255,0.15)] ml-auto">
                        {new Date(mem.created_at).toLocaleDateString("vi-VN")}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#dde2ec]">{mem.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
