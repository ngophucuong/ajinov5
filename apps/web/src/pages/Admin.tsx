import { useState, useEffect, useCallback, useRef } from "react";
import { getToken, requestOTP, verifyOTP, setToken } from "../lib/auth";
import {
  getMemories,
  updateMemory,
  createMemory,
  bulkApproveMemory,
  getDocuments,
  createDocument,
  compileDocument,
  updateDocument,
  uploadDocument,
  deleteDocument,
  getAgents,
  getSkills,
  updateSkill,
  getAudit,
  getAdminMetrics,
  getAdminAudit,
  getAdminSettings,
  getAuditExportUrl,
} from "../lib/api";
import type {
  MemoryItem,
  StudioDocument,
  AgentStatus,
  SkillStatus,
  AuditLogEntry,
} from "../lib/types";
import {
  IconLayoutDashboard,
  IconBrain,
  IconBooks,
  IconRobot,
  IconPlugConnected,
  IconShieldCheck,
  IconCheck,
  IconX,
  IconEdit,
  IconPlus,
  IconUpload,
  IconDownload,
  IconRefresh,
  IconList,
  IconSettings,
  IconMessageCircle,
  IconFileText,
  IconFileTypePdf,
  IconFileSpreadsheet,
  IconFileWord,
} from "@tabler/icons-react";

// File icon helper
function docFileIcon(filename: string) {
  const ext = (filename || "").split(".").pop()?.toLowerCase();
  const props = {
    size: 15,
    style: { color: C.am, opacity: 0.7 },
    className: "flex-shrink-0" as string,
  };
  switch (ext) {
    case "pdf":
      return <IconFileTypePdf {...props} />;
    case "docx":
    case "doc":
      return <IconFileWord {...props} />;
    case "xlsx":
    case "xls":
    case "csv":
      return <IconFileSpreadsheet {...props} />;
    default:
      return <IconFileText {...props} />;
  }
}

// ─── Types ──────────────────────────────────────────────
type Page = "dashboard" | "memory" | "studio" | "agents" | "skills" | "audit";
type MemFilter = "pending" | "canonical" | "archived";

interface Metrics {
  canonical: number;
  pending: number;
  sessions: number;
  tokens: number;
}

// ─── Color constants (design reference) ─────────────────
const C = {
  bg: "#0a0906",
  s1: "#100e0a",
  s2: "#181410",
  b1: "rgba(255,255,255,0.05)",
  b2: "rgba(255,255,255,0.09)",
  tx: "#ede8df",
  mu: "#6b6358",
  am: "#c8842a",
  am0: "rgba(200,132,42,0.08)",
  am1: "rgba(200,132,42,0.14)",
  am2: "rgba(200,132,42,0.28)",
  gr: "#4a8c5c",
  gr0: "rgba(74,140,92,0.08)",
  gr1: "rgba(74,140,92,0.14)",
  re: "#c45050",
  re0: "rgba(196,80,80,0.08)",
  re1: "rgba(196,80,80,0.14)",
  pu: "#7a62d4",
  pu0: "rgba(122,98,212,0.08)",
} as const;

// ─── Helpers ────────────────────────────────────────────
function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return "vừa xong";
    if (diffMin < 60) return `${diffMin} phút`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    return `${Math.round(diffH / 24)} ngày`;
  } catch {
    return iso;
  }
}

function fmtTokens(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

// ─── Component ──────────────────────────────────────────
export default function Admin() {
  const [page, setPage] = useState<Page>("dashboard");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(!!getToken());

  // OTP auth state
  const [tgId, setTgId] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  async function handleRequestOTP() {
    setAuthError("");
    setAuthLoading(true);
    try {
      await requestOTP(Number(tgId));
      setOtpSent(true);
    } catch {
      setAuthError("Không gửi được OTP");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyOTP() {
    setAuthError("");
    setAuthLoading(true);
    try {
      await verifyOTP(Number(tgId), otp);
      setHasToken(true);
    } catch {
      setAuthError("Mã OTP không đúng");
    } finally {
      setAuthLoading(false);
    }
  }

  // Check for token on mount
  useEffect(() => {
    setHasToken(!!getToken());
  }, []);

  // No token → show OTP login form
  if (!hasToken) {
    return (
      <div
        style={{
          background: C.bg,
          color: C.tx,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ width: "100%", maxWidth: 360, padding: "0 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div
              style={{
                fontFamily: "'Exo 2', sans-serif",
                fontSize: 48,
                fontWeight: 600,
                color: C.am,
                marginBottom: 8,
              }}
            >
              A
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>
              Ajino v5 — Admin
            </h2>
            <p
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: C.mu,
                letterSpacing: ".1em",
              }}
            >
              Đăng nhập bằng Telegram
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: ".1em",
                  color: C.mu,
                }}
              >
                Telegram ID
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={tgId}
                onChange={(e) => setTgId(e.target.value)}
                placeholder="VD: 5250339472"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !otpSent) handleRequestOTP();
                  if (e.key === "Enter" && otpSent) handleVerifyOTP();
                }}
                style={{
                  background: "#0a0906",
                  border: `0.5px solid rgba(255,255,255,0.09)`,
                  borderRadius: 6,
                  padding: "10px 16px",
                  color: C.tx,
                  fontSize: 14,
                  outline: "none",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
            </label>

            {!otpSent ? (
              <button
                onClick={handleRequestOTP}
                disabled={authLoading || !tgId}
                style={{
                  width: "100%",
                  padding: "10px 0",
                  borderRadius: 6,
                  border: "none",
                  cursor: authLoading || !tgId ? "not-allowed" : "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  letterSpacing: ".05em",
                  color: "#0a0906",
                  background:
                    "linear-gradient(140deg, #c8842a 0%, #8a5a1a 100%)",
                  opacity: authLoading || !tgId ? 0.5 : 1,
                }}
              >
                {authLoading ? "Đang gửi..." : "Gửi mã OTP"}
              </button>
            ) : (
              <>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: ".1em",
                      color: C.mu,
                    }}
                  >
                    Mã OTP (kiểm tra Telegram)
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleVerifyOTP();
                    }}
                    style={{
                      background: "#0a0906",
                      border: `0.5px solid rgba(255,255,255,0.09)`,
                      borderRadius: 6,
                      padding: "10px 16px",
                      color: C.tx,
                      fontSize: 14,
                      textAlign: "center",
                      letterSpacing: "0.3em",
                      outline: "none",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  />
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleRequestOTP}
                    disabled={authLoading}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 6,
                      border: `0.5px solid rgba(255,255,255,0.09)`,
                      background: "transparent",
                      cursor: authLoading ? "not-allowed" : "pointer",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      color: C.mu,
                      opacity: authLoading ? 0.5 : 1,
                    }}
                  >
                    Gửi lại
                  </button>
                  <button
                    onClick={handleVerifyOTP}
                    disabled={authLoading || otp.length < 6}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 6,
                      border: "none",
                      cursor:
                        authLoading || otp.length < 6
                          ? "not-allowed"
                          : "pointer",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 12,
                      letterSpacing: ".05em",
                      color: "#0a0906",
                      background:
                        "linear-gradient(140deg, #c8842a 0%, #8a5a1a 100%)",
                      opacity: authLoading || otp.length < 6 ? 0.5 : 1,
                    }}
                  >
                    {authLoading ? "Đang xác thực..." : "Xác nhận OTP"}
                  </button>
                </div>
              </>
            )}

            {authError && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  background: C.re0,
                  border: `0.5px solid rgba(196,80,80,0.2)`,
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: C.re,
                  textAlign: "center",
                }}
              >
                {authError}
              </div>
            )}

            <div style={{ textAlign: "center" }}>
              <a
                href="/"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  color: C.mu,
                  textDecoration: "none",
                }}
              >
                ← Về giao diện CEO
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard
  const [metrics, setMetrics] = useState<Metrics>({
    canonical: 0,
    pending: 0,
    sessions: 0,
    tokens: 0,
  });
  const [dashAgents, setDashAgents] = useState<AgentStatus[]>([]);
  const [dashAudit, setDashAudit] = useState<AuditLogEntry[]>([]);

  // Memory
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memFilter, setMemFilter] = useState<MemFilter>("pending");

  // Studio
  const [docs, setDocs] = useState<StudioDocument[]>([]);

  // Agents
  const [agents, setAgents] = useState<AgentStatus[]>([]);

  // Skills
  const [skills, setSkills] = useState<SkillStatus[]>([]);

  // Audit
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditHasMore, setAuditHasMore] = useState(true);

  // ─── Load data based on page ─────────────────────────
  const loadPage = useCallback(
    async (p: Page) => {
      setLoading(true);
      try {
        switch (p) {
          case "dashboard": {
            const [m, ags, aud] = await Promise.all([
              getAdminMetrics().catch(() => null),
              getAgents().catch(() => []),
              getAudit({ limit: 5 }).catch(() => []),
            ]);
            if (m) {
              setMetrics({
                canonical: m.canonical_count,
                pending: m.pending_count,
                sessions: m.sessions_today,
                tokens: m.tokens_today,
              });
            }
            setDashAgents(ags);
            setDashAudit(aud);
            break;
          }
          case "memory":
            setMemories(
              await getMemories({ status: memFilter, limit: 50 }).catch(
                () => [],
              ),
            );
            break;
          case "studio":
            setDocs(await getDocuments().catch(() => []));
            break;
          case "agents":
            setAgents(await getAgents().catch(() => []));
            break;
          case "skills":
            setSkills(await getSkills().catch(() => []));
            break;
          case "audit": {
            const result = await getAdminAudit().catch(() => ({
              entries: [] as AuditLogEntry[],
              next_cursor: null,
            }));
            setAudit(result.entries);
            setAuditCursor(result.next_cursor);
            setAuditHasMore(result.next_cursor !== null);
            break;
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [memFilter],
  );

  useEffect(() => {
    loadPage(page);
  }, [page, loadPage]);

  // ─── Modal state ──────────────────────────────────────
  const [settingsModal, setSettingsModal] = useState(false);
  const [settingsData, setSettingsData] = useState<{
    version: string;
    tenant_id: string;
    db_connected: boolean;
    pgvector_connected: boolean;
  } | null>(null);
  const [addMemoryModal, setAddMemoryModal] = useState(false);
  const [newMemoryContent, setNewMemoryContent] = useState("");
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  // ─── Actions ──────────────────────────────────────────
  async function handleApproveMemory(id: string) {
    try {
      await updateMemory(id, { status: "canonical" });
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setMetrics((prev) => ({
        ...prev,
        pending: Math.max(0, prev.pending - 1),
        canonical: prev.canonical + 1,
      }));
      flash("Đã duyệt");
    } catch {
      flash("Lỗi khi duyệt");
    }
  }

  async function handleRejectMemory(id: string) {
    try {
      await updateMemory(id, { status: "archived" });
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setMetrics((prev) => ({
        ...prev,
        pending: Math.max(0, prev.pending - 1),
      }));
      flash("Đã từ chối");
    } catch {
      flash("Lỗi khi từ chối");
    }
  }

  async function handleSettings() {
    setSettingsModal(true);
    try {
      const data = await getAdminSettings();
      setSettingsData(data);
    } catch {
      setSettingsData(null);
    }
  }

  async function handleAddManualMemory() {
    if (!newMemoryContent.trim()) return;
    try {
      await createMemory({
        content: newMemoryContent.trim(),
        source: "manual",
      });
      setNewMemoryContent("");
      setAddMemoryModal(false);
      flash("Đã thêm memory");
      loadPage("memory");
    } catch {
      flash("Lỗi khi thêm");
    }
  }

  async function handleSaveEditMemory(id: string) {
    if (!editingContent.trim()) return;
    try {
      await updateMemory(id, { content: editingContent.trim() });
      setMemories((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, content: editingContent.trim() } : m,
        ),
      );
      setEditingMemoryId(null);
      setEditingContent("");
      flash("Đã cập nhật");
    } catch {
      flash("Lỗi khi cập nhật");
    }
  }

  async function handleDeleteDoc(id: string) {
    if (!window.confirm("Xóa tài liệu này?")) return;
    try {
      await deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      flash("Đã xóa");
    } catch {
      flash("Lỗi khi xóa");
    }
  }

  async function handleBulkApprove() {
    const ids = memories.map((m) => m.id);
    if (ids.length === 0) return;
    try {
      const result = await bulkApproveMemory(ids);
      setMemories([]);
      setMetrics((prev) => ({
        ...prev,
        pending: Math.max(0, prev.pending - result.approved),
        canonical: prev.canonical + result.approved,
      }));
      flash(`Đã duyệt ${result.approved} mục`);
    } catch {
      flash("Lỗi khi duyệt hàng loạt");
    }
  }

  async function handleCompileDoc(doc: StudioDocument) {
    const chars = doc.content?.length || 0;
    if (chars > 20000) {
      const confirmed = window.confirm(
        `⚠️ Tài liệu lớn\n\n"${doc.title}"\n${chars.toLocaleString()} ký tự → ước tính ~${Math.ceil(chars / 800)} memory items\n\nTất cả sẽ vào Memory Review để bạn duyệt.\n\nNhấn OK để tiếp tục.`,
      );
      if (!confirmed) return;
    }
    setDocs((prev) =>
      prev.map((d) =>
        d.id === doc.id ? { ...d, compile_status: "compiling" } : d,
      ),
    );
    try {
      const result = await compileDocument(doc.id);
      setDocs((prev) =>
        prev.map((d) =>
          d.id === doc.id
            ? {
                ...d,
                compile_status: "compiled",
                memory_ids: result.memory_ids,
              }
            : d,
        ),
      );
      flash(`✅ Đã tạo ${result.count} memory từ "${doc.title}"`);
    } catch {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === doc.id ? { ...d, compile_status: "draft" } : d,
        ),
      );
      flash("Lỗi biên dịch");
    }
  }

  async function handleUploadDoc(title: string, content: string) {
    try {
      const doc = await createDocument({ title, content });
      setDocs((prev) => [
        { ...doc, updated_at: new Date().toISOString() } as StudioDocument,
        ...prev,
      ]);
      flash("Đã tải lên");
    } catch {
      flash("Lỗi tải lên");
    }
  }

  async function handleUploadFile(file: File, title?: string) {
    const doc = await uploadDocument(file, title);
    setDocs((prev) => [
      { ...doc, updated_at: new Date().toISOString() } as StudioDocument,
      ...prev,
    ]);
    flash("Đã tải lên");
  }

  async function handleLoadMoreAudit() {
    if (!auditCursor) return;
    try {
      const result = await getAdminAudit(auditCursor);
      setAudit((prev) => [...prev, ...result.entries]);
      setAuditCursor(result.next_cursor);
      setAuditHasMore(result.next_cursor !== null);
    } catch {
      // ignore
    }
  }

  function flash(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 2500);
  }

  function switchPage(p: Page, filter?: MemFilter) {
    setPage(p);
    if (filter) setMemFilter(filter);
  }

  // Derived counts
  const pendingCount =
    page === "memory"
      ? memories.filter((m) => m.status === "pending").length
      : metrics.pending;

  // ─── Layout ───────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-screen"
      style={{
        background: C.bg,
        color: C.tx,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
      }}
    >
      {/* Topbar */}
      <Topbar
        pendingCount={pendingCount}
        onRefresh={() => loadPage(page)}
        onSettings={handleSettings}
      />

      {/* Main: sidebar + content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          page={page}
          pendingCount={pendingCount}
          onNavigate={switchPage}
        />

        {/* Content */}
        <div
          className="flex-1 flex flex-col"
          style={{ background: C.bg, overflowX: "hidden" }}
        >
          {message && (
            <div
              className="px-4 py-2 text-center flex-shrink-0"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                background: C.am0,
                color: C.am,
                borderBottom: `0.5px solid ${C.am2}`,
              }}
            >
              {message}
            </div>
          )}

          {page === "dashboard" && (
            <Dashboard
              metrics={metrics}
              agents={dashAgents}
              audit={dashAudit}
              loading={loading}
              onNavigate={switchPage}
            />
          )}
          {page === "memory" && (
            <MemoryPage
              memories={memories}
              filter={memFilter}
              loading={loading}
              pendingCount={
                memories.filter((m) => m.status === "pending").length
              }
              canonicalCount={
                memories.filter((m) => m.status === "canonical").length
              }
              archivedCount={
                memories.filter((m) => m.status === "archived").length
              }
              onFilterChange={(f) => {
                setMemFilter(f);
                getMemories({ status: f, limit: 50 })
                  .then(setMemories)
                  .catch(() => {});
              }}
              onApprove={handleApproveMemory}
              onReject={handleRejectMemory}
              onBulkApprove={handleBulkApprove}
              onAddMemory={() => setAddMemoryModal(true)}
              editingMemoryId={editingMemoryId}
              editingContent={editingContent}
              onStartEdit={(id, content) => {
                setEditingMemoryId(id);
                setEditingContent(content);
              }}
              onSaveEdit={handleSaveEditMemory}
              onCancelEdit={() => {
                setEditingMemoryId(null);
                setEditingContent("");
              }}
              onEditingContentChange={setEditingContent}
            />
          )}
          {page === "studio" && (
            <StudioPage
              docs={docs}
              loading={loading}
              onCompile={handleCompileDoc}
              onUpload={handleUploadDoc}
              onUploadFile={handleUploadFile}
              onNavigateToMemory={() => switchPage("memory", "pending")}
              onDelete={handleDeleteDoc}
            />
          )}
          {page === "agents" && (
            <AgentsPage
              agents={agents}
              loading={loading}
              onRefresh={() => loadPage("agents")}
            />
          )}
          {page === "skills" && (
            <SkillsPage
              skills={skills}
              loading={loading}
              onToggle={async (name, enabled) => {
                // Optimistic update
                setSkills((prev) =>
                  prev.map((s) => (s.name === name ? { ...s, enabled } : s)),
                );
                try {
                  await updateSkill(name, enabled);
                } catch {
                  // Revert on failure
                  setSkills((prev) =>
                    prev.map((s) =>
                      s.name === name ? { ...s, enabled: !enabled } : s,
                    ),
                  );
                }
              }}
            />
          )}
          {page === "audit" && (
            <AuditPage
              entries={audit}
              loading={loading}
              hasMore={auditHasMore}
              onLoadMore={handleLoadMoreAudit}
            />
          )}
        </div>
      </div>

      {/* ─── Settings Modal ────────────────────────── */}
      {settingsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setSettingsModal(false)}
        >
          <div
            className="rounded-lg p-6 min-w-[320px] flex flex-col gap-4"
            style={{
              background: C.s1,
              border: `0.5px solid ${C.b1}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span
                style={{
                  fontFamily: "'Exo 2', sans-serif",
                  fontSize: 16,
                  fontWeight: 500,
                  color: C.tx,
                }}
              >
                Cài đặt hệ thống
              </span>
              <button
                onClick={() => setSettingsModal(false)}
                className="w-6 h-6 rounded flex items-center justify-center cursor-pointer bg-transparent border-none"
                style={{ color: C.mu }}
              >
                <IconX size={14} />
              </button>
            </div>
            {settingsData ? (
              <div
                className="flex flex-col gap-2"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                }}
              >
                <div className="flex justify-between">
                  <span style={{ color: C.mu }}>Version</span>
                  <span style={{ color: C.tx }}>{settingsData.version}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: C.mu }}>Tenant ID</span>
                  <span style={{ color: C.tx }}>
                    {settingsData.tenant_id?.slice(0, 8)}…
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: C.mu }}>Database</span>
                  <span
                    style={{ color: settingsData.db_connected ? C.gr : C.re }}
                  >
                    {settingsData.db_connected
                      ? "✅ Kết nối"
                      : "❌ Mất kết nối"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: C.mu }}>PGVector</span>
                  <span
                    style={{
                      color: settingsData.pgvector_connected ? C.gr : C.re,
                    }}
                  >
                    {settingsData.pgvector_connected
                      ? "✅ Kết nối"
                      : "❌ Mất kết nối"}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ color: C.mu, textAlign: "center" }}>
                Đang tải...
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Add Memory Modal ──────────────────────── */}
      {addMemoryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => {
            setAddMemoryModal(false);
            setNewMemoryContent("");
          }}
        >
          <div
            className="rounded-lg p-6 min-w-[420px] flex flex-col gap-4"
            style={{
              background: C.s1,
              border: `0.5px solid ${C.b1}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span
                style={{
                  fontFamily: "'Exo 2', sans-serif",
                  fontSize: 16,
                  fontWeight: 500,
                  color: C.tx,
                }}
              >
                Thêm memory thủ công
              </span>
              <button
                onClick={() => {
                  setAddMemoryModal(false);
                  setNewMemoryContent("");
                }}
                className="w-6 h-6 rounded flex items-center justify-center cursor-pointer bg-transparent border-none"
                style={{ color: C.mu }}
              >
                <IconX size={14} />
              </button>
            </div>
            <textarea
              value={newMemoryContent}
              onChange={(e) => setNewMemoryContent(e.target.value)}
              placeholder="Nhập nội dung memory..."
              className="w-full bg-[#0a0906] border border-[rgba(255,255,255,0.09)] rounded-[6px] px-4 py-3 text-[#ede8df] resize-none outline-none focus:border-[#c8842a]"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                minHeight: 120,
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                  handleAddManualMemory();
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setAddMemoryModal(false);
                  setNewMemoryContent("");
                }}
                className="px-4 py-2 rounded-[6px] text-[11px] font-mono cursor-pointer bg-transparent border border-[rgba(255,255,255,0.09)]"
                style={{ color: C.mu }}
              >
                Hủy
              </button>
              <button
                onClick={handleAddManualMemory}
                disabled={!newMemoryContent.trim()}
                className="px-4 py-2 rounded-[6px] text-[11px] font-mono cursor-pointer border-none disabled:opacity-50"
                style={{
                  background: C.am,
                  color: "#0a0906",
                }}
              >
                Thêm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Topbar ─────────────────────────────────────────────
function Topbar({
  pendingCount,
  onRefresh,
  onSettings,
}: {
  pendingCount: number;
  onRefresh: () => void;
  onSettings: () => void;
}) {
  return (
    <header
      className="h-[46px] flex items-center px-4 gap-[10px] flex-shrink-0"
      style={{
        background: C.s1,
        borderBottom: `0.5px solid rgba(255,255,255,0.09)`,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span
          style={{
            fontFamily: "'Exo 2', sans-serif",
            fontSize: 24,
            fontWeight: 600,
            color: C.am,
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          A
        </span>
        <div className="flex flex-col" style={{ gap: 2 }}>
          <span
            style={{
              fontFamily: "'Exo 2', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              color: C.tx,
              letterSpacing: "0.05em",
              lineHeight: 1,
            }}
          >
            Ajino
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 8,
              color: C.mu,
              letterSpacing: "0.12em",
              lineHeight: 1,
            }}
          >
            v5 · Admin
          </span>
        </div>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 8,
            padding: "2px 7px",
            borderRadius: 3,
            background: C.am1,
            color: C.am,
            border: `0.5px solid ${C.am2}`,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          admin
        </span>
      </div>

      {/* Center: stat pills */}
      <div className="flex-1 flex items-center justify-center gap-[10px]">
        <div
          className="flex items-center gap-[5px] px-[10px] py-1 rounded-[20px]"
          style={{
            background: C.s2,
            border: `0.5px solid rgba(255,255,255,0.09)`,
          }}
        >
          <span
            className="block w-[5px] h-[5px] rounded-full flex-shrink-0"
            style={{
              background: C.am,
              animation: "apulse 2.4s ease-in-out infinite",
            }}
          />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: C.mu,
            }}
          >
            Chờ duyệt
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              color: C.am,
            }}
          >
            {pendingCount}
          </span>
        </div>
        <div
          className="flex items-center gap-[5px] px-[10px] py-1 rounded-[20px]"
          style={{
            background: C.s2,
            border: `0.5px solid rgba(255,255,255,0.09)`,
          }}
        >
          <span
            className="block w-[5px] h-[5px] rounded-full flex-shrink-0"
            style={{
              background: C.re,
              animation: "apulse 2s ease-in-out infinite",
            }}
          />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: C.mu,
            }}
          >
            Cảnh báo
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              color: C.re,
            }}
          >
            1
          </span>
        </div>
      </div>

      {/* Right */}
      <div className="flex gap-1 items-center">
        <a
          href="/"
          title="Về giao diện CEO"
          className="flex items-center gap-[5px] px-[10px] py-1 rounded-md no-underline transition-colors"
          style={{
            border: `0.5px solid rgba(255,255,255,0.09)`,
            background: "transparent",
            color: C.mu,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            letterSpacing: ".06em",
            textTransform: "uppercase",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = C.s2;
            e.currentTarget.style.color = C.tx;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = C.mu;
          }}
        >
          <IconMessageCircle size={13} /> CEO UI
        </a>
        <button
          className="w-7 h-7 rounded-md border border-transparent bg-transparent flex items-center justify-center cursor-pointer transition-all text-sm"
          style={{ color: C.mu }}
          onClick={onRefresh}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = C.s2;
            e.currentTarget.style.borderColor = C.b1;
            e.currentTarget.style.color = C.tx;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "transparent";
            e.currentTarget.style.color = C.mu;
          }}
          title="Làm mới"
        >
          <IconRefresh size={14} />
        </button>
        <button
          className="w-7 h-7 rounded-md border border-transparent bg-transparent flex items-center justify-center cursor-pointer transition-all text-sm"
          style={{ color: C.mu }}
          onClick={onSettings}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = C.s2;
            e.currentTarget.style.borderColor = C.b1;
            e.currentTarget.style.color = C.tx;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "transparent";
            e.currentTarget.style.color = C.mu;
          }}
          title="Cài đặt"
        >
          <IconSettings size={14} />
        </button>
      </div>
    </header>
  );
}

// ─── Sidebar ────────────────────────────────────────────
function Sidebar({
  page,
  pendingCount,
  onNavigate,
}: {
  page: Page;
  pendingCount: number;
  onNavigate: (p: Page, filter?: MemFilter) => void;
}) {
  const navSections = [
    {
      label: "Tổng quan",
      items: [
        {
          id: "dashboard" as Page,
          icon: IconLayoutDashboard,
          label: "Dashboard",
        },
      ],
    },
    {
      label: "Tri thức",
      items: [
        {
          id: "memory" as Page,
          icon: IconBrain,
          label: "Memory Review",
          badge: pendingCount,
        },
        { id: "studio" as Page, icon: IconBooks, label: "Studio" },
      ],
    },
    {
      label: "Hệ thống",
      items: [
        { id: "agents" as Page, icon: IconRobot, label: "Agents" },
        { id: "skills" as Page, icon: IconPlugConnected, label: "Skills" },
        { id: "audit" as Page, icon: IconShieldCheck, label: "Audit Log" },
      ],
    },
  ];

  return (
    <aside
      className="w-[200px] flex-shrink-0 flex flex-col py-[10px]"
      style={{
        background: C.s1,
        borderRight: `0.5px solid ${C.b1}`,
      }}
    >
      {navSections.map((section) => (
        <div key={section.label}>
          <div
            className="px-[14px] pt-2 pb-[2px] mt-2 first:mt-0"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 8,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: C.mu,
              opacity: 0.6,
            }}
          >
            {section.label}
          </div>
          {section.items.map((item) => {
            const Icon = item.icon;
            const isActive = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() =>
                  onNavigate(
                    item.id,
                    item.id === "memory" ? "pending" : undefined,
                  )
                }
                title={item.label}
                className="flex items-center gap-2 py-[7px] px-[14px] w-full text-left cursor-pointer transition-all border-l-2"
                style={{
                  fontSize: 12,
                  color: isActive ? C.tx : C.mu,
                  background: isActive ? C.am1 : "transparent",
                  borderLeftColor: isActive ? C.am : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = C.am0;
                    e.currentTarget.style.borderLeftColor =
                      "rgba(200,132,42,0.3)";
                    e.currentTarget.style.color = C.tx;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderLeftColor = "transparent";
                    e.currentTarget.style.color = C.mu;
                  }
                }}
              >
                <Icon size={15} className="flex-shrink-0" />
                {item.label}
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className="ml-auto"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9,
                      padding: "1px 6px",
                      borderRadius: 3,
                      background: C.re1,
                      color: C.re,
                      border: `0.5px solid rgba(196,80,80,0.25)`,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

// ─── Content Header ─────────────────────────────────────
function ContentHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className="h-[46px] flex items-center px-[22px] gap-[10px] flex-shrink-0"
      style={{
        background: C.s1,
        borderBottom: `0.5px solid ${C.b1}`,
      }}
    >
      <span
        style={{
          fontFamily: "'Exo 2', sans-serif",
          fontSize: 14,
          fontWeight: 500,
          color: C.tx,
        }}
      >
        {title}
      </span>
      {subtitle && (
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: C.mu,
            letterSpacing: ".06em",
          }}
        >
          {subtitle}
        </span>
      )}
      {actions && <div className="ml-auto flex gap-[6px]">{actions}</div>}
    </div>
  );
}

// ─── Scrollable Content ─────────────────────────────────
function ScrollContent({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex-1 overflow-y-auto p-[18px_22px] flex flex-col gap-[14px]"
      style={{
        scrollbarWidth: "thin",
        scrollbarColor: `${C.b2} transparent`,
        overflowY: "auto",
      }}
    >
      {children}
    </div>
  );
}

// ─── Buttons ────────────────────────────────────────────
function Btn({
  children,
  primary,
  onClick,
  title,
}: {
  children: React.ReactNode;
  primary?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center gap-[5px] py-[5px] px-[11px] rounded-md cursor-pointer transition-all"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        letterSpacing: ".03em",
        border: `0.5px solid ${primary ? C.am2 : "rgba(255,255,255,0.09)"}`,
        background: primary ? C.am1 : "transparent",
        color: primary ? C.am : C.mu,
      }}
      onMouseEnter={(e) => {
        if (primary) {
          e.currentTarget.style.background = C.am2;
        } else {
          e.currentTarget.style.background = C.s2;
          e.currentTarget.style.color = C.tx;
        }
      }}
      onMouseLeave={(e) => {
        if (primary) {
          e.currentTarget.style.background = C.am1;
        } else {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = C.mu;
        }
      }}
    >
      {children}
    </button>
  );
}

// ─── Card ───────────────────────────────────────────────
function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: C.s1,
        border: `0.5px solid ${C.b1}`,
      }}
    >
      {title && (
        <div
          className="px-[14px] py-[10px] flex items-center justify-between"
          style={{ borderBottom: `0.5px solid ${C.b1}` }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: C.am,
              opacity: 0.8,
            }}
          >
            {title}
          </span>
          {action && (
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                color: C.mu,
                cursor: "pointer",
              }}
            >
              {action}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────
function Tabs({
  items,
  active,
  onChange,
}: {
  items: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      className="flex flex-shrink-0"
      style={{ borderBottom: `0.5px solid ${C.b1}` }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className="px-4 py-2 cursor-pointer transition-all"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            letterSpacing: ".07em",
            textTransform: "uppercase",
            color: active === item.id ? C.am : C.mu,
            borderBottom:
              active === item.id
                ? `2px solid ${C.am}`
                : "2px solid transparent",
            marginBottom: "-0.5px",
          }}
          onMouseEnter={(e) => {
            if (active !== item.id) e.currentTarget.style.color = C.tx;
          }}
          onMouseLeave={(e) => {
            if (active !== item.id) e.currentTarget.style.color = C.mu;
          }}
        >
          {item.label}
          {item.count !== undefined && (
            <span style={{ color: active === item.id ? C.am : C.mu }}>
              {" "}
              ({item.count})
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────
function Empty({ text = "Không có dữ liệu" }: { text?: string }) {
  return (
    <div
      className="py-7 px-[14px] text-center"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        color: C.mu,
        letterSpacing: ".06em",
      }}
    >
      {text}
    </div>
  );
}

// ─── Loading ────────────────────────────────────────────
function Loader({ small }: { small?: boolean }) {
  if (small) {
    return (
      <span
        style={{
          display: "inline-block",
          width: 10,
          height: 10,
          border: `1.5px solid ${C.am}`,
          borderTopColor: "transparent",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
    );
  }
  return (
    <div
      className="py-7 px-[14px] text-center"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        color: C.mu,
        letterSpacing: ".06em",
      }}
    >
      Đang tải...
    </div>
  );
}

// ─── DASHBOARD ──────────────────────────────────────────
function Dashboard({
  metrics,
  agents,
  audit,
  loading,
  onNavigate,
}: {
  metrics: Metrics;
  agents: AgentStatus[];
  audit: AuditLogEntry[];
  loading: boolean;
  onNavigate: (p: Page) => void;
}) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("vi-VN");
  const timeStr = now.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <ContentHeader title="Dashboard" subtitle={`${dateStr} — ${timeStr}`} />
      <ScrollContent>
        {/* Metrics */}
        <div className="grid grid-cols-4 gap-[10px]">
          <div
            className="rounded-lg p-[12px_14px] flex flex-col gap-1"
            style={{ background: C.s1, border: `0.5px solid ${C.b1}` }}
          >
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: C.mu,
              }}
            >
              Canonical
            </span>
            <span
              style={{
                fontFamily: "'Exo 2', sans-serif",
                fontSize: 22,
                fontWeight: 500,
                color: C.gr,
                lineHeight: 1,
              }}
            >
              {metrics.canonical}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                color: C.mu,
              }}
            >
              bộ nhớ đã duyệt
            </span>
          </div>
          <div
            className="rounded-lg p-[12px_14px] flex flex-col gap-1"
            style={{ background: C.s1, border: `0.5px solid ${C.b1}` }}
          >
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: C.mu,
              }}
            >
              Chờ duyệt
            </span>
            <span
              style={{
                fontFamily: "'Exo 2', sans-serif",
                fontSize: 22,
                fontWeight: 500,
                color: C.am,
                lineHeight: 1,
              }}
            >
              {metrics.pending}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                color: C.mu,
              }}
            >
              cần xem xét
            </span>
          </div>
          <div
            className="rounded-lg p-[12px_14px] flex flex-col gap-1"
            style={{ background: C.s1, border: `0.5px solid ${C.b1}` }}
          >
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: C.mu,
              }}
            >
              Sessions
            </span>
            <span
              style={{
                fontFamily: "'Exo 2', sans-serif",
                fontSize: 22,
                fontWeight: 500,
                color: C.tx,
                lineHeight: 1,
              }}
            >
              {metrics.sessions}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                color: C.mu,
              }}
            >
              phiên chat
            </span>
          </div>
          <div
            className="rounded-lg p-[12px_14px] flex flex-col gap-1"
            style={{ background: C.s1, border: `0.5px solid ${C.b1}` }}
          >
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: C.mu,
              }}
            >
              Tokens
            </span>
            <span
              style={{
                fontFamily: "'Exo 2', sans-serif",
                fontSize: 22,
                fontWeight: 500,
                color: C.tx,
                lineHeight: 1,
              }}
            >
              {fmtTokens(metrics.tokens)}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                color: C.mu,
              }}
            >
              hôm nay
            </span>
          </div>
        </div>

        {/* Two-column cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Agents status */}
          <Card
            title="Agents status"
            action={
              <span
                onClick={() => onNavigate("agents")}
                title="Xem chi tiết agents"
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = C.tx;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = C.mu;
                }}
              >
                xem chi tiết →
              </span>
            }
          >
            {loading ? (
              <Loader />
            ) : agents.length === 0 ? (
              <Empty text="Chưa có dữ liệu agent" />
            ) : (
              agents.map((agent) => {
                const maxCalls = Math.max(
                  ...agents.map((a) => a.call_count_today || 0),
                  1,
                );
                const pct =
                  maxCalls > 0
                    ? ((agent.call_count_today || 0) / maxCalls) * 100
                    : 0;
                return (
                  <div
                    key={agent.name}
                    className="flex items-center gap-[10px] py-[9px] px-[14px]"
                    style={{ borderBottom: `0.5px solid ${C.b1}` }}
                  >
                    <span
                      className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                      style={{
                        background: agent.status === "active" ? C.gr : C.b2,
                        animation:
                          agent.status === "active"
                            ? "apulse 2s ease-in-out infinite"
                            : "none",
                      }}
                    />
                    <span className="flex-1" style={{ fontSize: 12 }}>
                      {agent.name}
                    </span>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 9,
                        color: C.mu,
                        marginRight: 8,
                      }}
                    >
                      {agent.status === "active"
                        ? `${agent.call_count_today || 0} lần`
                        : "nghỉ"}
                    </span>
                    <div
                      className="w-[60px] h-[3px] rounded-[2px] overflow-hidden"
                      style={{ background: C.b2 }}
                    >
                      <div
                        className="h-full rounded-[2px]"
                        style={{
                          width: `${pct}%`,
                          background: C.am,
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </Card>

          {/* Recent audit */}
          <Card
            title="Audit log gần nhất"
            action={
              <span
                onClick={() => onNavigate("audit")}
                title="Xem tất cả nhật ký"
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = C.tx;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = C.mu;
                }}
              >
                xem tất cả →
              </span>
            }
          >
            {loading ? (
              <Loader />
            ) : audit.length === 0 ? (
              <Empty text="Chưa có nhật ký" />
            ) : (
              audit.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 py-2 px-[14px]"
                  style={{
                    borderBottom: `0.5px solid ${C.b1}`,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                  }}
                >
                  <span
                    className="whitespace-nowrap"
                    style={{ color: C.mu, minWidth: 72 }}
                  >
                    {fmtTime(entry.created_at)}
                  </span>
                  <span
                    className="whitespace-nowrap"
                    style={{ color: C.am, minWidth: 140 }}
                  >
                    {entry.action}
                  </span>
                  <span
                    className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{ color: C.tx }}
                  >
                    {entry.resource_type || entry.resource_id || "—"}
                  </span>
                  {entry.llm_model && (
                    <span
                      className="whitespace-nowrap ml-2"
                      style={{ color: C.pu }}
                    >
                      {entry.llm_model}
                    </span>
                  )}
                  {entry.llm_tokens !== undefined && entry.llm_tokens > 0 && (
                    <span
                      className="whitespace-nowrap text-right"
                      style={{ color: C.mu, minWidth: 50 }}
                    >
                      {fmtTokens(entry.llm_tokens)}t
                    </span>
                  )}
                </div>
              ))
            )}
          </Card>
        </div>
      </ScrollContent>
    </>
  );
}

// ─── MEMORY PAGE ────────────────────────────────────────
function MemoryPage({
  memories,
  filter,
  loading,
  pendingCount,
  canonicalCount,
  archivedCount,
  onFilterChange,
  onApprove,
  onReject,
  onBulkApprove,
  onAddMemory,
  editingMemoryId,
  editingContent,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditingContentChange,
}: {
  memories: MemoryItem[];
  filter: MemFilter;
  loading: boolean;
  pendingCount: number;
  canonicalCount: number;
  archivedCount: number;
  onFilterChange: (f: MemFilter) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBulkApprove: () => void;
  onAddMemory: () => void;
  editingMemoryId: string | null;
  editingContent: string;
  onStartEdit: (id: string, content: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onEditingContentChange: (content: string) => void;
}) {
  return (
    <>
      <ContentHeader
        title="Memory Review"
        subtitle={`${pendingCount} chờ duyệt · ${canonicalCount} canonical · ${archivedCount} archived`}
        actions={
          <>
            {filter === "pending" && pendingCount > 0 && (
              <Btn
                primary
                onClick={onBulkApprove}
                title="Duyệt tất cả memory đang chờ"
              >
                <IconCheck size={12} /> Duyệt tất cả
              </Btn>
            )}
            <Btn title="Thêm memory thủ công" onClick={onAddMemory}>
              <IconPlus size={12} /> Thêm thủ công
            </Btn>
          </>
        }
      />
      <Tabs
        items={[
          { id: "pending", label: "Chờ duyệt", count: pendingCount },
          { id: "canonical", label: "Canonical", count: canonicalCount },
          { id: "archived", label: "Archived", count: archivedCount },
        ]}
        active={filter}
        onChange={(id) => onFilterChange(id as MemFilter)}
      />
      <ScrollContent>
        {loading ? (
          <Loader />
        ) : memories.length === 0 ? (
          <Empty />
        ) : (
          <Card>
            {memories.map((mem, idx, arr) => {
              const isLast = idx === arr.length - 1;
              const sourceLabel =
                mem.source === "chat"
                  ? "chat"
                  : mem.source === "capture"
                    ? "capture"
                    : mem.source === "studio"
                      ? "studio"
                      : "thủ công";
              return (
                <div
                  key={mem.id}
                  className="flex items-start gap-[10px] py-[10px] px-[14px] group transition-colors"
                  style={{
                    borderBottom: isLast ? "none" : `0.5px solid ${C.b1}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = C.am0;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {/* Dot */}
                  <span
                    className="w-[5px] h-[5px] rounded-full flex-shrink-0 mt-[6px]"
                    style={{
                      background:
                        filter === "pending"
                          ? C.re
                          : filter === "canonical"
                            ? C.gr
                            : C.mu,
                      animation:
                        filter === "pending"
                          ? "apulse 2s ease-in-out infinite"
                          : "none",
                    }}
                  />
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {editingMemoryId === mem.id ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={editingContent}
                          onChange={(e) =>
                            onEditingContentChange(e.target.value)
                          }
                          className="w-full bg-[#0a0906] border border-[rgba(255,255,255,0.09)] rounded-[6px] px-3 py-2 text-[12px] text-[#ede8df] resize-none outline-none focus:border-[#c8842a]"
                          style={{
                            fontFamily: "'DM Sans', sans-serif",
                            minHeight: 60,
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") onCancelEdit();
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                              onSaveEdit(mem.id);
                          }}
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={() => onSaveEdit(mem.id)}
                            className="px-3 py-1 rounded-[4px] text-[10px] font-mono cursor-pointer border-none text-[#0a0906]"
                            style={{ background: C.am }}
                          >
                            Lưu
                          </button>
                          <button
                            onClick={onCancelEdit}
                            className="px-3 py-1 rounded-[4px] text-[10px] font-mono cursor-pointer bg-transparent border border-[rgba(255,255,255,0.09)]"
                            style={{ color: C.mu }}
                          >
                            Hủy
                          </button>
                          <span
                            className="text-[9px] font-mono ml-auto self-center"
                            style={{ color: C.mu }}
                          >
                            Ctrl+Enter để lưu · Esc để hủy
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p
                        className="line-clamp-2"
                        style={{ fontSize: 12, color: C.tx, lineHeight: 1.5 }}
                      >
                        {mem.content}
                      </p>
                    )}
                    <div className="flex gap-[6px] items-center mt-[3px]">
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 8,
                          padding: "1px 5px",
                          borderRadius: 3,
                          background:
                            filter === "pending"
                              ? C.re0
                              : filter === "canonical"
                                ? C.gr0
                                : C.b1,
                          color:
                            filter === "pending"
                              ? C.re
                              : filter === "canonical"
                                ? C.gr
                                : C.mu,
                          border:
                            filter === "pending"
                              ? `0.5px solid rgba(196,80,80,0.2)`
                              : filter === "canonical"
                                ? `0.5px solid rgba(74,140,92,0.2)`
                                : `0.5px solid rgba(255,255,255,0.09)`,
                        }}
                      >
                        {filter === "pending"
                          ? "chờ duyệt"
                          : filter === "canonical"
                            ? "đã duyệt"
                            : "lưu trữ"}
                      </span>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 8,
                          padding: "1px 5px",
                          borderRadius: 3,
                          background: C.am0,
                          color: C.am,
                          border: `0.5px solid rgba(200,132,42,0.2)`,
                        }}
                      >
                        {sourceLabel}
                      </span>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 8,
                          color: C.mu,
                        }}
                      >
                        {fmtRelative(mem.created_at)}
                      </span>
                    </div>
                  </div>
                  {/* Actions (visible on hover) */}
                  <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {filter === "pending" && (
                      <>
                        <button
                          onClick={() => onApprove(mem.id)}
                          className="w-[26px] h-[26px] rounded-[5px] border flex items-center justify-center cursor-pointer transition-all text-[13px]"
                          style={{
                            borderColor: C.b2,
                            background: "transparent",
                            color: C.mu,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = C.gr1;
                            e.currentTarget.style.color = C.gr;
                            e.currentTarget.style.borderColor =
                              "rgba(74,140,92,0.3)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = C.mu;
                            e.currentTarget.style.borderColor = C.b2;
                          }}
                          title="Duyệt"
                        >
                          <IconCheck size={13} />
                        </button>
                        <button
                          onClick={() => onStartEdit(mem.id, mem.content)}
                          className="w-[26px] h-[26px] rounded-[5px] border flex items-center justify-center cursor-pointer transition-all text-[13px]"
                          style={{
                            borderColor: C.b2,
                            background: "transparent",
                            color: C.mu,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = C.am1;
                            e.currentTarget.style.color = C.am;
                            e.currentTarget.style.borderColor = C.am2;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = C.mu;
                            e.currentTarget.style.borderColor = C.b2;
                          }}
                          title="Sửa"
                        >
                          <IconEdit size={13} />
                        </button>
                        <button
                          onClick={() => onReject(mem.id)}
                          className="w-[26px] h-[26px] rounded-[5px] border flex items-center justify-center cursor-pointer transition-all text-[13px]"
                          style={{
                            borderColor: C.b2,
                            background: "transparent",
                            color: C.mu,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = C.re1;
                            e.currentTarget.style.color = C.re;
                            e.currentTarget.style.borderColor =
                              "rgba(196,80,80,0.3)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = C.mu;
                            e.currentTarget.style.borderColor = C.b2;
                          }}
                          title="Từ chối"
                        >
                          <IconX size={13} />
                        </button>
                      </>
                    )}
                    {(filter === "canonical" || filter === "archived") && (
                      <button
                        onClick={() => onStartEdit(mem.id, mem.content)}
                        className="w-[26px] h-[26px] rounded-[5px] border flex items-center justify-center cursor-pointer transition-all text-[13px]"
                        style={{
                          borderColor: C.b2,
                          background: "transparent",
                          color: C.mu,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = C.am1;
                          e.currentTarget.style.color = C.am;
                          e.currentTarget.style.borderColor = C.am2;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = C.mu;
                          e.currentTarget.style.borderColor = C.b2;
                        }}
                        title="Sửa"
                      >
                        <IconEdit size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </ScrollContent>
    </>
  );
}

// ─── STUDIO PAGE ────────────────────────────────────────
function StudioPage({
  docs,
  loading,
  onCompile,
  onUpload,
  onUploadFile,
  onNavigateToMemory,
  onDelete,
}: {
  docs: StudioDocument[];
  loading: boolean;
  onCompile: (doc: StudioDocument) => void;
  onUpload: (title: string, content: string) => void;
  onUploadFile: (file: File, title?: string) => Promise<void>;
  onNavigateToMemory?: () => void;
  onDelete: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // ── Markdown text upload (existing) ──────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const title = file.name.replace(/\.(md|txt)$/, "");
      onUpload(title, content);
    };
    reader.readAsText(file);
    // Reset input so same file can be re-uploaded
    e.target.value = "";
  }

  // ── File upload via FormData (new) ───────────────────
  async function handleDropFile(file: File) {
    setIsUploading(true);
    setUploadingFileName(file.name);
    try {
      const title = file.name.replace(/\.[^.]+$/, "");
      await onUploadFile(file, title);
    } catch {
      // Error already flashed by parent
    } finally {
      setIsUploading(false);
      setUploadingFileName("");
    }
  }

  function handleDropInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleDropFile(file);
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleDropFile(file);
  }

  function statusBadge(status: string, memoryCount?: number) {
    switch (status) {
      case "draft":
        return {
          text: "Chưa xử lý",
          bg: C.b1,
          color: C.mu,
          border: C.b2,
          icon: null as React.ReactNode,
        };
      case "compiling":
        return {
          text: "Đang xử lý",
          bg: C.am0,
          color: C.am,
          border: C.am2,
          icon: <Loader small />,
        };
      case "compiled":
        return {
          text: `✓ ${memoryCount || 0} memories`,
          bg: C.gr0,
          color: C.gr,
          border: "rgba(74,140,92,0.2)",
          icon: <IconCheck size={10} />,
        };
      case "failed":
        return {
          text: "Lỗi",
          bg: C.re0,
          color: C.re,
          border: "rgba(196,80,80,0.2)",
          icon: <IconX size={10} />,
        };
      default:
        return {
          text: status,
          bg: C.b1,
          color: C.mu,
          border: C.b2,
          icon: null as React.ReactNode,
        };
    }
  }

  // ── Drop zone shared UI ──────────────────────────────
  const [uploadingFileName, setUploadingFileName] = useState("");
  const dropZone = (
    <div
      className="flex flex-col items-center justify-center gap-[8px] py-[32px] px-[20px]"
      style={{
        border: `2px dashed ${isDragging ? C.am : C.b2}`,
        borderRadius: 8,
        background: isDragging ? C.am0 : isUploading ? "transparent" : C.bg,
        cursor: isUploading ? "default" : "pointer",
        transition: "background 0.15s, border-color 0.15s",
        minHeight: 180,
      }}
      onClick={() => !isUploading && dropRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isUploading ? (
        <>
          <Loader />
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              color: C.am,
              letterSpacing: "0.4px",
            }}
          >
            Đang tải lên{uploadingFileName ? `: ${uploadingFileName}` : "..."}
          </span>
        </>
      ) : isDragging ? (
        <>
          <IconUpload size={28} style={{ color: C.am }} />
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: C.am,
              letterSpacing: "0.4px",
              fontWeight: 500,
            }}
          >
            Thả file vào đây
          </span>
        </>
      ) : (
        <>
          <IconUpload size={28} style={{ color: C.mu, opacity: 0.6 }} />
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: C.tx,
              letterSpacing: "0.4px",
            }}
          >
            Kéo thả tài liệu vào đây hoặc click để chọn file
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              color: C.mu,
              letterSpacing: "0.3px",
            }}
          >
            Hỗ trợ: PDF, DOCX, XLSX, PPTX, CSV, TXT, MD
          </span>
        </>
      )}
    </div>
  );

  return (
    <>
      <ContentHeader
        title="Studio"
        subtitle="Biên tập và compile tài liệu thành canonical memory"
        actions={
          <>
            {/* Hidden: markdown text upload (existing) */}
            <input
              ref={fileRef}
              type="file"
              accept=".md,.txt,.markdown"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            {/* Hidden: file upload via FormData (new) */}
            <input
              ref={dropRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.pptx,.csv,.txt,.md"
              onChange={handleDropInputChange}
              style={{ display: "none" }}
            />
            <Btn
              primary
              onClick={() => fileRef.current?.click()}
              title="Tải lên file Markdown"
            >
              <IconUpload size={12} /> Upload Markdown
            </Btn>
          </>
        }
      />
      <ScrollContent>
        {loading ? (
          <Loader />
        ) : (
          <>
            {/* Always show drop zone above the list */}
            {docs.length === 0 ? (
              dropZone
            ) : (
              <>
                {dropZone}
                <div style={{ height: 12 }} />
              </>
            )}
            {docs.length > 0 && (
              <Card
                title="Tài liệu"
                action={<span>{docs.length} documents</span>}
              >
                {docs.map((doc, idx, arr) => {
                  const sb = statusBadge(
                    doc.compile_status,
                    doc.memory_ids?.length,
                  );
                  const chars = doc.content?.length || 0;
                  const filename = doc.r2_key?.split("/").pop() || doc.title;
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center gap-[10px] py-[9px] px-[14px]"
                      style={{
                        borderBottom:
                          idx === arr.length - 1
                            ? "none"
                            : `0.5px solid ${C.b1}`,
                      }}
                    >
                      {/* File type icon based on extension */}
                      {docFileIcon(doc.title)}
                      <div className="flex-1 min-w-0">
                        <span
                          className="block whitespace-nowrap overflow-hidden text-ellipsis"
                          style={{ fontSize: 12, color: C.tx }}
                        >
                          {doc.title}
                        </span>
                        <span
                          className="block whitespace-nowrap overflow-hidden text-ellipsis"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 9,
                            color: C.mu,
                            letterSpacing: "0.3px",
                            marginTop: 2,
                          }}
                        >
                          {filename !== doc.title ? `${filename} · ` : ""}
                          {chars.toLocaleString()} ký tự ·{" "}
                          {fmtTime(doc.created_at)}
                        </span>
                      </div>
                      <span
                        className="whitespace-nowrap flex items-center gap-[4px]"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 9,
                          padding: "2px 6px",
                          borderRadius: 3,
                          background: sb.bg,
                          color: sb.color,
                          border: `0.5px solid ${sb.border}`,
                        }}
                      >
                        {sb.icon}
                        {sb.text}
                      </span>
                      <div className="flex gap-1 flex-shrink-0 ml-2">
                        <button
                          onClick={() => {
                            const newTitle = prompt("Sửa tiêu đề:", doc.title);
                            if (newTitle && newTitle !== doc.title) {
                              updateDocument(doc.id, { title: newTitle })
                                .then(() => {
                                  // Refresh will happen via parent
                                })
                                .catch(() => {});
                            }
                          }}
                          className="w-[26px] h-[26px] rounded-[5px] border flex items-center justify-center cursor-pointer transition-all text-[13px]"
                          style={{
                            borderColor: C.b2,
                            background: "transparent",
                            color: C.mu,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = C.am1;
                            e.currentTarget.style.color = C.am;
                            e.currentTarget.style.borderColor = C.am2;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = C.mu;
                            e.currentTarget.style.borderColor = C.b2;
                          }}
                          title="Sửa tiêu đề tài liệu"
                        >
                          <IconEdit size={13} />
                        </button>
                        {doc.compile_status === "draft" && (
                          <button
                            onClick={() => onCompile(doc)}
                            className="w-[26px] h-[26px] rounded-[5px] border flex items-center justify-center cursor-pointer transition-all text-[13px]"
                            style={{
                              borderColor: C.b2,
                              background: "transparent",
                              color: C.mu,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = C.gr1;
                              e.currentTarget.style.color = C.gr;
                              e.currentTarget.style.borderColor =
                                "rgba(74,140,92,0.3)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = C.mu;
                              e.currentTarget.style.borderColor = C.b2;
                            }}
                            title="Compile — tách thành memory"
                          >
                            <IconBrain size={13} />
                          </button>
                        )}
                        {doc.compile_status === "compiled" &&
                          onNavigateToMemory && (
                            <button
                              onClick={onNavigateToMemory}
                              className="w-[26px] h-[26px] rounded-[5px] border flex items-center justify-center cursor-pointer transition-all text-[13px]"
                              style={{
                                borderColor: C.b2,
                                background: "transparent",
                                color: C.mu,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = C.pu0;
                                e.currentTarget.style.color = C.pu;
                                e.currentTarget.style.borderColor =
                                  "rgba(122,98,212,0.3)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background =
                                  "transparent";
                                e.currentTarget.style.color = C.mu;
                                e.currentTarget.style.borderColor = C.b2;
                              }}
                              title="Xem memory — mở Memory Review"
                            >
                              <IconList size={13} />
                            </button>
                          )}
                        <button
                          onClick={() => onDelete(doc.id)}
                          className="w-[26px] h-[26px] rounded-[5px] border flex items-center justify-center cursor-pointer transition-all text-[13px]"
                          style={{
                            borderColor: C.b2,
                            background: "transparent",
                            color: C.mu,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = C.re1;
                            e.currentTarget.style.color = C.re;
                            e.currentTarget.style.borderColor =
                              "rgba(196,80,80,0.3)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = C.mu;
                            e.currentTarget.style.borderColor = C.b2;
                          }}
                          title="Xóa tài liệu"
                        >
                          <IconX size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}
          </>
        )}
      </ScrollContent>
    </>
  );
}

// ─── AGENTS PAGE ────────────────────────────────────────
function AgentsPage({
  agents,
  loading,
  onRefresh,
}: {
  agents: AgentStatus[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const activeCount = agents.filter((a) => a.status === "active").length;
  const idleCount = agents.filter((a) => a.status === "idle").length;
  const maxCalls = Math.max(...agents.map((a) => a.call_count_today || 0), 1);

  return (
    <>
      <ContentHeader
        title="Agents"
        subtitle={`${activeCount} hoạt động · ${idleCount} nghỉ`}
        actions={
          <Btn title="Làm mới danh sách agent" onClick={onRefresh}>
            <IconRefresh size={12} /> Làm mới
          </Btn>
        }
      />
      <ScrollContent>
        {loading ? (
          <Loader />
        ) : agents.length === 0 ? (
          <Empty text="Chưa có agent" />
        ) : (
          <Card title="Agent network">
            {agents.map((agent, idx, arr) => {
              const pct =
                maxCalls > 0
                  ? ((agent.call_count_today || 0) / maxCalls) * 100
                  : 0;
              return (
                <div
                  key={agent.name}
                  className="flex items-center gap-[10px] py-[9px] px-[14px]"
                  style={{
                    borderBottom:
                      idx === arr.length - 1 ? "none" : `0.5px solid ${C.b1}`,
                  }}
                >
                  <span
                    className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                    style={{
                      background: agent.status === "active" ? C.gr : C.b2,
                      animation:
                        agent.status === "active"
                          ? "apulse 2s ease-in-out infinite"
                          : "none",
                    }}
                  />
                  <span className="flex-1" style={{ fontSize: 12 }}>
                    {agent.name}
                  </span>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9,
                      color: C.mu,
                      marginRight: 8,
                      minWidth: 80,
                      textAlign: "right" as const,
                    }}
                  >
                    {agent.status === "active"
                      ? `${agent.call_count_today || 0} lần`
                      : "nghỉ"}
                  </span>
                  <div
                    className="w-[60px] h-[3px] rounded-[2px] overflow-hidden"
                    style={{ background: C.b2 }}
                  >
                    <div
                      className="h-full rounded-[2px]"
                      style={{
                        width: `${pct}%`,
                        background: C.am,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </ScrollContent>
    </>
  );
}

// ─── SKILLS PAGE ────────────────────────────────────────
function SkillsPage({
  skills,
  loading,
  onToggle,
}: {
  skills: SkillStatus[];
  loading: boolean;
  onToggle: (name: string, enabled: boolean) => void;
}) {
  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <>
      <ContentHeader
        title="Skills"
        subtitle={`${skills.length} kỹ năng · ${enabledCount} đang bật`}
      />
      <ScrollContent>
        {loading ? (
          <Loader />
        ) : skills.length === 0 ? (
          <Empty text="Chưa có kỹ năng" />
        ) : (
          <Card title="Skill registry">
            {skills.map((skill, idx, arr) => (
              <div
                key={skill.name}
                className="flex items-center gap-2 py-2 px-[14px]"
                style={{
                  borderBottom:
                    idx === arr.length - 1 ? "none" : `0.5px solid ${C.b1}`,
                }}
              >
                {/* Toggle */}
                <div
                  className="w-7 h-4 rounded-[8px] relative cursor-pointer transition-all flex-shrink-0"
                  onClick={() => onToggle(skill.name, !skill.enabled)}
                  title={skill.enabled ? "Tắt kỹ năng" : "Bật kỹ năng"}
                  style={{
                    background: skill.enabled ? C.am1 : C.s2,
                    borderColor: skill.enabled ? C.am2 : C.b2,
                    borderWidth: 0.5,
                    borderStyle: "solid",
                  }}
                >
                  <span
                    className="absolute top-[2px] w-[10px] h-[10px] rounded-full transition-all"
                    style={{
                      left: skill.enabled ? "14px" : "2px",
                      background: skill.enabled ? C.am : C.mu,
                    }}
                  />
                </div>
                <span className="flex-1" style={{ fontSize: 12 }}>
                  {skill.name}
                </span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9,
                    color: C.mu,
                    marginRight: 8,
                  }}
                >
                  v{skill.version}
                </span>
                <span
                  className="text-right"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9,
                    color: C.am,
                    minWidth: 40,
                  }}
                >
                  {skill.call_count_session !== undefined
                    ? `${skill.call_count_session} lần`
                    : "—"}
                </span>
              </div>
            ))}
          </Card>
        )}
      </ScrollContent>
    </>
  );
}

// ─── AUDIT PAGE ─────────────────────────────────────────
function AuditPage({
  entries,
  loading,
  hasMore,
  onLoadMore,
}: {
  entries: AuditLogEntry[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const today = new Date().toLocaleDateString("vi-VN");

  return (
    <>
      <ContentHeader
        title="Audit Log"
        subtitle={`Append-only · ${entries.length} bản ghi`}
        actions={
          <a href={getAuditExportUrl()} download>
            <Btn title="Xuất file CSV nhật ký">
              <IconDownload size={12} /> Export CSV
            </Btn>
          </a>
        }
      />
      <ScrollContent>
        {loading ? (
          <Loader />
        ) : entries.length === 0 ? (
          <Empty text="Chưa có nhật ký" />
        ) : (
          <div className="flex flex-col gap-[14px]">
            <Card title={today} action={<span>{entries.length} bản ghi</span>}>
              {entries.map((entry, idx, arr) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 py-2 px-[14px] transition-colors"
                  style={{
                    borderBottom:
                      idx === arr.length - 1 ? "none" : `0.5px solid ${C.b1}`,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = C.am0;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span
                    className="whitespace-nowrap"
                    style={{ color: C.mu, minWidth: 72 }}
                  >
                    {fmtTime(entry.created_at)}
                  </span>
                  <span
                    className="whitespace-nowrap"
                    style={{ color: C.am, minWidth: 140 }}
                  >
                    {entry.action}
                  </span>
                  <span
                    className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{ color: C.tx }}
                  >
                    {entry.resource_type && entry.resource_id
                      ? `${entry.resource_type} · ${entry.resource_id.slice(0, 8)}…`
                      : entry.resource_type || entry.resource_id || "—"}
                  </span>
                  {entry.llm_model && (
                    <span
                      className="whitespace-nowrap ml-2"
                      style={{ color: C.pu }}
                    >
                      {entry.llm_model}
                    </span>
                  )}
                  {entry.llm_tokens !== undefined && entry.llm_tokens > 0 && (
                    <span
                      className="whitespace-nowrap text-right"
                      style={{ color: C.mu, minWidth: 50 }}
                    >
                      {fmtTokens(entry.llm_tokens)}t
                    </span>
                  )}
                </div>
              ))}
            </Card>

            {hasMore && (
              <div className="text-center">
                <button
                  onClick={onLoadMore}
                  title="Tải thêm bản ghi"
                  className="py-2 px-6 rounded-md cursor-pointer transition-all"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    color: C.mu,
                    border: `0.5px solid ${C.b2}`,
                    background: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = C.s2;
                    e.currentTarget.style.color = C.tx;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = C.mu;
                  }}
                >
                  Tải thêm...
                </button>
              </div>
            )}
          </div>
        )}
      </ScrollContent>
    </>
  );
}
