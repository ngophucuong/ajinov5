import { useState, useEffect } from "react";
import type { StudioDocument } from "../lib/types";
import {
  getDocuments,
  createDocument,
  compileDocument,
  deleteDocument,
} from "../lib/api";
import {
  IconBooks,
  IconPlus,
  IconFileText,
  IconTrash,
  IconPlayerPlay,
} from "@tabler/icons-react";

// Lightweight list item type
interface DocListItem {
  id: string;
  title: string;
  compile_status: string;
  updated_at: string;
  created_at?: string;
  memory_ids_count?: number;
}

export default function Studio() {
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success",
  );

  function flash(msg: string, type: "success" | "error" = "success") {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(null), 4000);
  }

  useEffect(() => {
    loadDocs();
  }, []);

  async function loadDocs() {
    setLoading(true);
    setError(null);
    try {
      const data = await getDocuments();
      setDocs(data || []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không thể tải danh sách tài liệu",
      );
      setDocs([]);
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!title.trim()) return;
    try {
      const result = await createDocument({ title: title.trim(), content });
      setDocs((prev) => [
        {
          id: result.id,
          title: result.title || title.trim(),
          compile_status: result.compile_status || "draft",
          updated_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setTitle("");
      setContent("");
      setShowCreate(false);
      flash("Tài liệu đã được tạo");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Lỗi khi tạo tài liệu", "error");
    }
  }

  async function handleCompile(id: string) {
    setDocs((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, compile_status: "compiling" } : d,
      ),
    );
    try {
      const result = await compileDocument(id);
      setDocs((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                compile_status: "compiled",
                memory_ids_count: result.count,
              }
            : d,
        ),
      );
      flash(`Đã tạo ${result.count} memory`);
    } catch (e) {
      setDocs((prev) =>
        prev.map((d) => (d.id === id ? { ...d, compile_status: "failed" } : d)),
      );
      flash(e instanceof Error ? e.message : "Lỗi biên dịch", "error");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Xóa tài liệu này?")) return;
    try {
      await deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      flash("Đã xóa tài liệu");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Lỗi khi xóa", "error");
    }
  }

  function getStatusLabel(status: string): { text: string; cls: string } {
    switch (status) {
      case "draft":
        return {
          text: "bản nháp",
          cls: "bg-[rgba(255,255,255,0.05)] text-[#52586a] border-[rgba(255,255,255,0.1)]",
        };
      case "compiling":
        return {
          text: "đang xử lý",
          cls: "bg-[rgba(212,160,90,0.08)] text-[#d4a05a] border-[rgba(212,160,90,0.2)]",
        };
      case "compiled":
        return {
          text: "đã biên dịch",
          cls: "bg-[rgba(0,200,164,0.06)] text-[#00c8a4] border-[rgba(0,200,164,0.2)]",
        };
      case "failed":
        return {
          text: "lỗi",
          cls: "bg-[rgba(224,104,104,0.09)] text-[#e06868] border-[rgba(224,104,104,0.2)]",
        };
      default:
        return { text: status, cls: "" };
    }
  }

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
              v5 · Studio
            </span>
          </div>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-[rgba(0,200,164,0.13)] text-[#00c8a4] border border-[rgba(0,200,164,0.2)] hover:bg-[rgba(0,200,164,0.2)] transition-colors"
        >
          <IconPlus size={14} /> Tạo mới
        </button>
        <a
          href="/"
          className="w-[30px] h-[30px] rounded-[7px] border border-transparent bg-transparent text-[#52586a] flex items-center justify-center cursor-pointer transition-all hover:bg-[#12161f] hover:border-[rgba(255,255,255,0.05)] hover:text-[#dde2ec] no-underline"
        >
          ←
        </a>
      </header>

      <div className="flex-1 bg-[#070910] overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <IconBooks size={28} className="text-[#d4a05a]" />
            <div>
              <h2 className="font-display text-lg font-semibold text-[#dde2ec]">
                Studio
              </h2>
              <p className="font-mono text-[9px] text-[#52586a] uppercase">
                Quản lý tài liệu tri thức
              </p>
            </div>
          </div>

          {message && (
            <div
              className={`mb-4 px-4 py-3 rounded-lg text-xs font-mono border ${
                messageType === "error"
                  ? "bg-[rgba(224,104,104,0.06)] text-[#e06868] border-[rgba(224,104,104,0.13)]"
                  : "bg-[rgba(0,200,164,0.06)] text-[#00c8a4] border-[rgba(0,200,164,0.13)]"
              }`}
            >
              {messageType === "error" ? "✗ " : "✓ "}
              {message}
            </div>
          )}

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-[rgba(224,104,104,0.06)] text-[#e06868] text-xs font-mono border border-[rgba(224,104,104,0.13)]">
              ✗ {error}
              <button
                onClick={loadDocs}
                className="ml-3 underline hover:text-[#dde2ec]"
              >
                Thử lại
              </button>
            </div>
          )}

          {/* Create form */}
          {showCreate && (
            <div className="bg-[#0c0f18] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 mb-6">
              <h3 className="font-display text-sm font-semibold text-[#dde2ec] mb-3">
                Tạo tài liệu mới
              </h3>
              <input
                className="w-full bg-[#070910] border border-[rgba(255,255,255,0.09)] rounded-lg px-4 py-3 text-[#dde2ec] text-[13.5px] outline-none mb-3 focus:border-[#00c8a4] placeholder:text-[#52586a]"
                placeholder="Tiêu đề tài liệu..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <textarea
                className="w-full bg-[#070910] border border-[rgba(255,255,255,0.09)] rounded-lg px-4 py-3 text-[#dde2ec] text-[13.5px] resize-none outline-none min-h-[100px] focus:border-[#00c8a4] placeholder:text-[#52586a] font-mono text-xs"
                placeholder="Nội dung Markdown..."
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleCreate}
                  disabled={!title.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-mono bg-[rgba(0,200,164,0.13)] text-[#00c8a4] border border-[rgba(0,200,164,0.2)] hover:bg-[rgba(0,200,164,0.2)] transition-colors disabled:opacity-50"
                >
                  Tạo tài liệu
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-lg text-xs font-mono bg-transparent text-[#52586a] border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.09)] transition-colors"
                >
                  Hủy
                </button>
              </div>
            </div>
          )}

          {/* Documents list */}
          <h3 className="font-display text-sm font-semibold text-[#dde2ec] mb-3">
            Tài liệu ({docs.length})
          </h3>

          {loading ? (
            <div className="text-center text-[#52586a] py-8 font-mono text-xs">
              Đang tải...
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center text-[#52586a] py-8 font-mono text-xs">
              Chưa có tài liệu nào
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {docs.map((doc) => {
                const status = getStatusLabel(doc.compile_status);
                return (
                  <div
                    key={doc.id}
                    className="bg-[#0c0f18] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex items-center gap-3"
                  >
                    <IconFileText
                      size={20}
                      className="text-[#d4a05a] flex-shrink-0 opacity-70"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] text-[#dde2ec] font-medium truncate">
                          {doc.title}
                        </span>
                        <span
                          className={`font-mono text-[8px] px-[5px] py-px rounded border ${status.cls}`}
                        >
                          {status.text}
                        </span>
                        {doc.memory_ids_count !== undefined &&
                          doc.memory_ids_count > 0 && (
                            <span className="font-mono text-[8px] px-[5px] py-px rounded bg-[rgba(139,114,240,0.08)] text-[#8b72f0] border border-[rgba(139,114,240,0.2)]">
                              {doc.memory_ids_count} memories
                            </span>
                          )}
                      </div>
                      <span className="font-mono text-[9px] text-[#52586a]">
                        {new Date(doc.updated_at).toLocaleDateString("vi-VN")}
                      </span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {doc.compile_status === "draft" && (
                        <button
                          onClick={() => handleCompile(doc.id)}
                          className="p-2 rounded-md text-[#d4a05a] hover:bg-[rgba(212,160,90,0.1)] transition-colors"
                          title="Biên dịch"
                        >
                          <IconPlayerPlay size={14} />
                        </button>
                      )}
                      {doc.compile_status === "failed" && (
                        <button
                          onClick={() => handleCompile(doc.id)}
                          className="p-2 rounded-md text-[#e06868] hover:bg-[rgba(224,104,104,0.1)] transition-colors"
                          title="Thử biên dịch lại"
                        >
                          <IconPlayerPlay size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-2 rounded-md text-[#52586a] hover:bg-[rgba(224,104,104,0.1)] hover:text-[#e06868] transition-colors"
                        title="Xóa"
                      >
                        <IconTrash size={14} />
                      </button>
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
