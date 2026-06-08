import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { StudioDocument } from "../lib/types";
import {
  getDocuments,
  getDocument,
  createDocument,
  updateDocument,
  compileDocument,
  deleteDocument,
} from "../lib/api";
import {
  IconBooks,
  IconPlus,
  IconFileText,
  IconTrash,
  IconPlayerPlay,
  IconDeviceFloppy,
  IconEye,
  IconPencil,
  IconLayoutColumns,
} from "@tabler/icons-react";

interface DocListItem {
  id: string;
  title: string;
  compile_status: "draft" | "compiling" | "compiled" | "failed";
  updated_at: string;
  created_at?: string;
  memory_ids_count?: number;
}

type ViewMode = "preview" | "edit" | "split";

function renderMarkdownHtml(markdown: string): string {
  return markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
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

export default function Studio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [doc, setDoc] = useState<StudioDocument | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success",
  );

  const isDirty = useMemo(
    () => !!doc && (draftTitle !== doc.title || draftContent !== doc.content),
    [doc, draftContent, draftTitle],
  );

  function flash(msg: string, type: "success" | "error" = "success") {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(null), 4000);
  }

  function setDocParam(docId: string | null) {
    const next = new URLSearchParams(searchParams);
    if (docId) next.set("doc", docId);
    else next.delete("doc");
    setSearchParams(next, { replace: true });
  }

  async function loadDocs(preferredId?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const data = await getDocuments();
      const nextDocs = (data || []) as DocListItem[];
      setDocs(nextDocs);

      const queryDocId = searchParams.get("doc");
      const targetId =
        preferredId ||
        queryDocId ||
        (selectedId && nextDocs.some((item) => item.id === selectedId)
          ? selectedId
          : null) ||
        nextDocs[0]?.id ||
        null;

      setSelectedId(targetId);
      setDocParam(targetId);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không thể tải danh sách tài liệu",
      );
      setDocs([]);
      setSelectedId(null);
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fromQuery = searchParams.get("doc");
    if (fromQuery && fromQuery !== selectedId) {
      setSelectedId(fromQuery);
    }
  }, [searchParams, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDoc(null);
      setDraftTitle("");
      setDraftContent("");
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    getDocument(selectedId)
      .then((data) => {
        if (cancelled) return;
        setDoc(data);
        setDraftTitle(data.title);
        setDraftContent(data.content);
      })
      .catch((e) => {
        if (cancelled) return;
        setDoc(null);
        flash(
          e instanceof Error ? e.message : "Không thể mở tài liệu này",
          "error",
        );
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleCreate() {
    if (!createTitle.trim()) return;
    try {
      const result = await createDocument({
        title: createTitle.trim(),
        content: createContent,
      });
      const nextId = result.id;
      setCreateTitle("");
      setCreateContent("");
      setShowCreate(false);
      flash("Tài liệu đã được tạo");
      await loadDocs(nextId);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Lỗi khi tạo tài liệu", "error");
    }
  }

  async function handleSave() {
    if (!doc || !draftTitle.trim() || !isDirty) return;
    setSaving(true);
    try {
      await updateDocument(doc.id, {
        title: draftTitle.trim(),
        content: draftContent,
      });

      const nextStatus =
        draftContent !== doc.content ? "draft" : doc.compile_status;
      const nextDoc: StudioDocument = {
        ...doc,
        title: draftTitle.trim(),
        content: draftContent,
        compile_status: nextStatus,
        memory_ids: draftContent !== doc.content ? [] : doc.memory_ids,
        updated_at: new Date().toISOString(),
      };

      setDoc(nextDoc);
      setDocs((prev) =>
        prev.map((item) =>
          item.id === doc.id
            ? {
                ...item,
                title: nextDoc.title,
                compile_status: nextDoc.compile_status,
                updated_at: nextDoc.updated_at,
                memory_ids_count: nextDoc.memory_ids?.length || 0,
              }
            : item,
        ),
      );
      flash("Đã lưu tài liệu");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Lỗi khi lưu tài liệu", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleCompile(id: string) {
    setDocs((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, compile_status: "compiling" } : item,
      ),
    );
    if (doc?.id === id) {
      setDoc({ ...doc, compile_status: "compiling" });
    }

    try {
      const result = await compileDocument(id);
      setDocs((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                compile_status: "compiled",
                memory_ids_count: result.count,
                updated_at: new Date().toISOString(),
              }
            : item,
        ),
      );
      if (doc?.id === id) {
        setDoc({
          ...doc,
          compile_status: "compiled",
          memory_ids: result.memory_ids,
          updated_at: new Date().toISOString(),
        });
      }
      flash(`Đã tạo ${result.count} memory`);
    } catch (e) {
      setDocs((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, compile_status: "failed" } : item,
        ),
      );
      if (doc?.id === id) {
        setDoc({ ...doc, compile_status: "failed" });
      }
      flash(e instanceof Error ? e.message : "Lỗi biên dịch", "error");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Xóa tài liệu này?")) return;
    try {
      await deleteDocument(id);
      const remaining = docs.filter((item) => item.id !== id);
      setDocs(remaining);
      const nextId = remaining[0]?.id || null;
      setSelectedId(nextId);
      setDocParam(nextId);
      if (doc?.id === id) {
        setDoc(null);
        setDraftTitle("");
        setDraftContent("");
      }
      flash("Đã xóa tài liệu");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Lỗi khi xóa", "error");
    }
  }

  const activeStatus = getStatusLabel(doc?.compile_status || "draft");
  const previewHtml = useMemo(
    () => renderMarkdownHtml(draftContent || ""),
    [draftContent],
  );

  return (
    <div className="flex flex-col h-screen bg-[#070910]">
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
          onClick={() => setShowCreate((prev) => !prev)}
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

      <div className="flex-1 overflow-hidden p-5">
        <div className="h-full flex gap-5">
          <aside className="w-[320px] flex-shrink-0 bg-[#0c0f18] border border-[rgba(255,255,255,0.05)] rounded-[16px] overflow-hidden flex flex-col">
            <div className="px-4 py-4 border-b border-[rgba(255,255,255,0.05)]">
              <div className="flex items-center gap-2">
                <IconBooks size={24} className="text-[#d4a05a]" />
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#dde2ec]">
                    Studio
                  </h2>
                  <p className="font-mono text-[9px] text-[#52586a] uppercase">
                    Đọc, sửa và biên dịch tài liệu
                  </p>
                </div>
              </div>
            </div>

            {showCreate && (
              <div className="px-4 py-4 border-b border-[rgba(255,255,255,0.05)] flex flex-col gap-3">
                <input
                  className="w-full bg-[#070910] border border-[rgba(255,255,255,0.09)] rounded-lg px-4 py-3 text-[#dde2ec] text-[13px] outline-none focus:border-[#00c8a4] placeholder:text-[#52586a]"
                  placeholder="Tiêu đề tài liệu..."
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                />
                <textarea
                  className="w-full bg-[#070910] border border-[rgba(255,255,255,0.09)] rounded-lg px-4 py-3 text-[#dde2ec] text-[12px] resize-none outline-none min-h-[120px] focus:border-[#00c8a4] placeholder:text-[#52586a] font-mono"
                  placeholder="Nội dung Markdown..."
                  rows={6}
                  value={createContent}
                  onChange={(e) => setCreateContent(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={!createTitle.trim()}
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

            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-[#dde2ec]">
                Tài liệu ({docs.length})
              </span>
              {loading && (
                <span className="font-mono text-[9px] text-[#52586a]">
                  Đang tải...
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {!loading && docs.length === 0 ? (
                <div className="text-center text-[#52586a] py-10 font-mono text-xs">
                  Chưa có tài liệu nào
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {docs.map((item) => {
                    const status = getStatusLabel(item.compile_status);
                    const active = selectedId === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSelectedId(item.id);
                          setDocParam(item.id);
                        }}
                        className={`w-full text-left bg-[#070910] border rounded-xl p-3 transition-all ${
                          active
                            ? "border-[rgba(0,200,164,0.25)] bg-[rgba(0,200,164,0.06)]"
                            : "border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.12)]"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <IconFileText
                            size={18}
                            className="text-[#d4a05a] flex-shrink-0 mt-0.5 opacity-70"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-[12.5px] text-[#dde2ec] font-medium truncate">
                                {item.title}
                              </span>
                              <span
                                className={`font-mono text-[8px] px-[5px] py-px rounded border ${status.cls}`}
                              >
                                {status.text}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[9px] text-[#52586a]">
                                {new Date(item.updated_at).toLocaleDateString(
                                  "vi-VN",
                                )}
                              </span>
                              {(item.memory_ids_count || 0) > 0 && (
                                <span className="font-mono text-[8px] px-[5px] py-px rounded bg-[rgba(139,114,240,0.08)] text-[#8b72f0] border border-[rgba(139,114,240,0.2)]">
                                  {item.memory_ids_count} memory
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <section className="flex-1 min-w-0 bg-[#0c0f18] border border-[rgba(255,255,255,0.05)] rounded-[16px] overflow-hidden flex flex-col">
            {message && (
              <div
                className={`mx-5 mt-5 px-4 py-3 rounded-lg text-xs font-mono border ${
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
              <div className="mx-5 mt-5 px-4 py-3 rounded-lg bg-[rgba(224,104,104,0.06)] text-[#e06868] text-xs font-mono border border-[rgba(224,104,104,0.13)]">
                ✗ {error}
              </div>
            )}

            {!selectedId ? (
              <div className="flex-1 flex items-center justify-center text-center px-6">
                <div>
                  <div className="font-display text-[22px] text-[#dde2ec] mb-2">
                    Chọn một tài liệu trong Studio
                  </div>
                  <div className="font-mono text-[10px] text-[#52586a] uppercase tracking-[0.1em]">
                    Tại đây anh có thể đọc, sửa và compile thành memory
                  </div>
                </div>
              </div>
            ) : detailLoading || !doc ? (
              <div className="flex-1 flex items-center justify-center text-[#52586a] font-mono text-xs">
                Đang tải tài liệu...
              </div>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.05)] flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-[20px] font-semibold text-[#dde2ec] truncate">
                        {doc.title}
                      </h3>
                      <span
                        className={`font-mono text-[8px] px-[5px] py-px rounded border ${activeStatus.cls}`}
                      >
                        {activeStatus.text}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[9px] text-[#52586a] uppercase tracking-[0.08em]">
                      Cập nhật{" "}
                      {new Date(doc.updated_at).toLocaleString("vi-VN")}
                      {doc.memory_ids?.length
                        ? ` · ${doc.memory_ids.length} memory đã sinh`
                        : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <button
                      onClick={() => setViewMode("preview")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-mono border transition-colors ${
                        viewMode === "preview"
                          ? "bg-[rgba(139,114,240,0.15)] text-[#8b72f0] border-[rgba(139,114,240,0.25)]"
                          : "bg-transparent text-[#52586a] border-[rgba(255,255,255,0.08)]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <IconEye size={13} /> Xem
                      </span>
                    </button>
                    <button
                      onClick={() => setViewMode("edit")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-mono border transition-colors ${
                        viewMode === "edit"
                          ? "bg-[rgba(139,114,240,0.15)] text-[#8b72f0] border-[rgba(139,114,240,0.25)]"
                          : "bg-transparent text-[#52586a] border-[rgba(255,255,255,0.08)]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <IconPencil size={13} /> Sửa
                      </span>
                    </button>
                    <button
                      onClick={() => setViewMode("split")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-mono border transition-colors ${
                        viewMode === "split"
                          ? "bg-[rgba(139,114,240,0.15)] text-[#8b72f0] border-[rgba(139,114,240,0.25)]"
                          : "bg-transparent text-[#52586a] border-[rgba(255,255,255,0.08)]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <IconLayoutColumns size={13} /> Chia đôi
                      </span>
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!isDirty || saving || !draftTitle.trim()}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-mono border border-[rgba(0,200,164,0.2)] bg-[rgba(0,200,164,0.13)] text-[#00c8a4] disabled:opacity-50"
                    >
                      <span className="inline-flex items-center gap-1">
                        <IconDeviceFloppy size={13} />{" "}
                        {saving ? "Đang lưu" : "Lưu"}
                      </span>
                    </button>
                    <button
                      onClick={() => handleCompile(doc.id)}
                      disabled={doc.compile_status === "compiling"}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-mono border border-[rgba(212,160,90,0.2)] bg-[rgba(212,160,90,0.08)] text-[#d4a05a] disabled:opacity-50"
                    >
                      <span className="inline-flex items-center gap-1">
                        <IconPlayerPlay size={13} /> Compile
                      </span>
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-mono border border-[rgba(224,104,104,0.2)] bg-[rgba(224,104,104,0.08)] text-[#e06868]"
                    >
                      <span className="inline-flex items-center gap-1">
                        <IconTrash size={13} /> Xóa
                      </span>
                    </button>
                  </div>
                </div>

                <div
                  className={`flex-1 min-h-0 ${
                    viewMode === "split" ? "grid grid-cols-2" : "block"
                  }`}
                >
                  {viewMode !== "preview" && (
                    <div className="min-h-0 overflow-y-auto p-5 border-r border-[rgba(255,255,255,0.05)]">
                      <div className="flex flex-col gap-3">
                        <div>
                          <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#52586a] mb-2">
                            Tiêu đề
                          </div>
                          <input
                            className="w-full bg-[#070910] border border-[rgba(255,255,255,0.09)] rounded-lg px-4 py-3 text-[#dde2ec] text-[14px] outline-none focus:border-[#00c8a4] placeholder:text-[#52586a]"
                            value={draftTitle}
                            onChange={(e) => setDraftTitle(e.target.value)}
                          />
                        </div>
                        <div>
                          <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#52586a] mb-2">
                            Markdown gốc
                          </div>
                          <textarea
                            className="w-full min-h-[520px] bg-[#070910] border border-[rgba(255,255,255,0.09)] rounded-lg px-4 py-4 text-[#dde2ec] text-[12px] resize-none outline-none focus:border-[#00c8a4] font-mono leading-[1.75]"
                            value={draftContent}
                            onChange={(e) => setDraftContent(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {viewMode !== "edit" && (
                    <div className="min-h-0 overflow-y-auto p-5">
                      <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#52586a] mb-3">
                        Bản xem trước
                      </div>
                      <div className="bg-[#070910] border border-[rgba(255,255,255,0.05)] rounded-[14px] p-6">
                        <div className="font-display text-[24px] font-semibold text-[#dde2ec] mb-5">
                          {draftTitle || "Chưa có tiêu đề"}
                        </div>
                        <div
                          className="studio-preview text-[14px] leading-[1.9] text-[#dde2ec]"
                          dangerouslySetInnerHTML={{ __html: previewHtml }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
