import { useState, useEffect } from "react";
import type { CaptureItem } from "../lib/types";
import { getCaptures, createCapture, commitCapture } from "../lib/api";
import { IconBolt, IconPlus, IconCheck, IconLink } from "@tabler/icons-react";

export default function Capture() {
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [captureMode, setCaptureMode] = useState<"text" | "link">("text");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadCaptures();
  }, []);

  async function loadCaptures() {
    try {
      const data = await getCaptures();
      setItems(data);
    } catch {
      // Demo data
      setItems([
        {
          id: "c1",
          user_id: "u1",
          type: "text",
          content: "Đối tác Hồng Kông yêu cầu tăng SLA lên 99.5% từ Q4",
          status: "extracted",
          extracted_facts: [
            { fact: "Đối tác HK yêu cầu SLA 99.5%", confidence: 0.92 },
            { fact: "Thời hạn áp dụng: Q4/2026", confidence: 0.88 },
          ],
          created_at: "2026-06-07T10:00:00Z",
        },
        {
          id: "c2",
          user_id: "u1",
          type: "link",
          url: "https://example.com/logistics-report",
          status: "processing",
          created_at: "2026-06-07T09:30:00Z",
        },
        {
          id: "c3",
          user_id: "u1",
          type: "text",
          content: "Cuộc họp với đối tác Nhật ngày 15/7 về mở rộng kho bãi",
          status: "committed",
          extracted_facts: [
            { fact: "Họp đối tác Nhật 15/7/2026", confidence: 0.95 },
            { fact: "Chủ đề: mở rộng kho bãi", confidence: 0.90 },
          ],
          created_at: "2026-06-06T08:00:00Z",
        },
      ]);
    }
    setLoading(false);
  }

  async function handleCreate() {
    const content = inputText.trim();
    const url = inputUrl.trim();

    if (captureMode === "text" && !content) return;
    if (captureMode === "link" && !url) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const result = await createCapture({
        type: captureMode,
        content: captureMode === "text" ? content : undefined,
        url: captureMode === "link" ? url : undefined,
      });
      setMessage(`Đã ghi nhận — ID: ${result.id.slice(0, 8)}...`);
      setInputText("");
      setInputUrl("");
      setTimeout(() => loadCaptures(), 2000);
    } catch {
      // Optimistic add
      const newItem: CaptureItem = {
        id: crypto.randomUUID(),
        user_id: "u1",
        type: captureMode,
        content: captureMode === "text" ? content : undefined,
        url: captureMode === "link" ? url : undefined,
        status: "processing",
        created_at: new Date().toISOString(),
      };
      setItems((prev) => [newItem, ...prev]);
      setMessage("Đã ghi nhận (chế độ ngoại tuyến)");
      setInputText("");
      setInputUrl("");
    }
    setSubmitting(false);
  }

  async function handleCommit(id: string) {
    try {
      await commitCapture(id);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: "committed" as const } : item)),
      );
    } catch {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: "committed" as const } : item)),
      );
    }
  }

  function getStatusLabel(status: string): { text: string; cls: string } {
    switch (status) {
      case "processing":
        return { text: "đang xử lý", cls: "bg-[rgba(212,160,90,0.08)] text-[#d4a05a] border-[rgba(212,160,90,0.2)]" };
      case "extracted":
        return { text: "đã trích xuất", cls: "bg-[rgba(139,114,240,0.08)] text-[#8b72f0] border-[rgba(139,114,240,0.2)]" };
      case "committed":
        return { text: "đã lưu", cls: "bg-[rgba(0,200,164,0.06)] text-[#00c8a4] border-[rgba(0,200,164,0.2)]" };
      case "failed":
        return { text: "lỗi", cls: "bg-[rgba(224,104,104,0.09)] text-[#e06868] border-[rgba(224,104,104,0.2)]" };
      default:
        return { text: status, cls: "" };
    }
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Topbar */}
      <header className="h-[46px] bg-[#0c0f18] border-b border-[rgba(255,255,255,0.05)] flex items-center px-4 gap-[10px] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-display text-[26px] font-semibold text-[#00c8a4] leading-none tracking-[-0.03em]">A</span>
          <div className="flex flex-col leading-none gap-0.5">
            <span className="font-display text-[13px] font-medium text-[#dde2ec] tracking-[0.05em]">Ajino</span>
            <span className="font-mono text-[8px] text-[#52586a] tracking-[0.12em]">v5 · Capture</span>
          </div>
        </div>
        <div className="flex-1" />
        <button className="w-[30px] h-[30px] rounded-[7px] border border-transparent bg-transparent text-[#52586a] flex items-center justify-center cursor-pointer transition-all hover:bg-[#12161f] hover:border-[rgba(255,255,255,0.05)] hover:text-[#dde2ec]">←</button>
      </header>

      <div className="flex-1 bg-[#070910] overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <IconBolt size={28} className="text-[#d4a05a]" />
            <div>
              <h2 className="font-display text-lg font-semibold text-[#dde2ec]">Capture</h2>
              <p className="font-mono text-[9px] text-[#52586a] uppercase">Ghi nhận thông tin nhanh</p>
            </div>
          </div>

          {/* Input form */}
          <div className="bg-[#0c0f18] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 mb-6">
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setCaptureMode("text")}
                className={`px-3 py-1.5 rounded text-[10px] font-mono transition-colors ${
                  captureMode === "text"
                    ? "bg-[rgba(0,200,164,0.13)] text-[#00c8a4] border border-[rgba(0,200,164,0.2)]"
                    : "bg-transparent text-[#52586a] border border-[rgba(255,255,255,0.05)]"
                }`}
              >
                Văn bản
              </button>
              <button
                onClick={() => setCaptureMode("link")}
                className={`px-3 py-1.5 rounded text-[10px] font-mono transition-colors ${
                  captureMode === "link"
                    ? "bg-[rgba(0,200,164,0.13)] text-[#00c8a4] border border-[rgba(0,200,164,0.2)]"
                    : "bg-transparent text-[#52586a] border border-[rgba(255,255,255,0.05)]"
                }`}
              >
                <IconLink size={12} className="inline mr-1" /> Liên kết
              </button>
            </div>

            {captureMode === "text" ? (
              <textarea
                className="w-full bg-[#070910] border border-[rgba(255,255,255,0.09)] rounded-lg px-4 py-3 text-[#dde2ec] text-[13.5px] resize-none outline-none min-h-[60px] focus:border-[#00c8a4] placeholder:text-[#52586a]"
                placeholder="Nhập thông tin cần ghi nhận..."
                rows={2}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
            ) : (
              <input
                className="w-full bg-[#070910] border border-[rgba(255,255,255,0.09)] rounded-lg px-4 py-3 text-[#dde2ec] text-[13.5px] outline-none focus:border-[#00c8a4] placeholder:text-[#52586a]"
                placeholder="https://..."
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
              />
            )}

            <button
              onClick={handleCreate}
              disabled={submitting}
              className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono bg-[rgba(0,200,164,0.13)] text-[#00c8a4] border border-[rgba(0,200,164,0.2)] hover:bg-[rgba(0,200,164,0.2)] transition-colors disabled:opacity-50"
            >
              <IconPlus size={14} /> Ghi nhận
            </button>

            {message && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-[rgba(0,200,164,0.06)] text-[#00c8a4] text-xs font-mono border border-[rgba(0,200,164,0.13)]">
                {message}
              </div>
            )}
          </div>

          {/* Items list */}
          <h3 className="font-display text-sm font-semibold text-[#dde2ec] mb-3">
            Đã ghi nhận ({items.length})
          </h3>

          {loading ? (
            <div className="text-center text-[#52586a] py-8 font-mono text-xs">Đang tải...</div>
          ) : items.length === 0 ? (
            <div className="text-center text-[#52586a] py-8 font-mono text-xs">
              Chưa có thông tin nào được ghi nhận
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => {
                const status = getStatusLabel(item.status);
                return (
                  <div
                    key={item.id}
                    className="bg-[#0c0f18] border border-[rgba(255,255,255,0.05)] rounded-xl p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-[9px] text-[#52586a] uppercase">
                            {item.type === "link" ? "🔗 liên kết" : "📝 văn bản"}
                          </span>
                          <span
                            className={`font-mono text-[8px] px-[5px] py-px rounded border ${status.cls}`}
                          >
                            {status.text}
                          </span>
                        </div>
                        <p className="text-[13px] text-[#dde2ec] leading-relaxed">
                          {item.type === "link" ? item.url : item.content}
                        </p>

                        {item.extracted_facts && item.extracted_facts.length > 0 && (
                          <div className="mt-2 flex flex-col gap-1">
                            <span className="font-mono text-[9px] text-[#8b72f0] uppercase">Sự kiện trích xuất:</span>
                            {item.extracted_facts.map((fact, fi) => (
                              <div key={fi} className="flex items-center gap-2">
                                <IconCheck size={12} className="text-[#00c8a4]" />
                                <span className="text-[11px] text-[#52586a]">{fact.fact}</span>
                                <span className="font-mono text-[9px] text-[rgba(255,255,255,0.15)]">
                                  {(fact.confidence * 100).toFixed(0)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {item.status === "extracted" && (
                          <button
                            onClick={() => handleCommit(item.id)}
                            className="mt-2 px-3 py-1 rounded text-[10px] font-mono bg-[rgba(212,160,90,0.08)] text-[#d4a05a] border border-[rgba(212,160,90,0.2)] hover:bg-[rgba(212,160,90,0.14)] transition-colors"
                          >
                            Lưu vào bộ nhớ
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
