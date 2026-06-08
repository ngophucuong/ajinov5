import { useState, useEffect } from "react";
import type { AgentStatus, SkillStatus, AuditLogEntry } from "../lib/types";
import { getAgents, getSkills, getAudit } from "../lib/api";
import { IconTerminal2 } from "@tabler/icons-react";

export default function Console() {
  const [tab, setTab] = useState<"agents" | "skills" | "audit">("agents");
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [skills, setSkills] = useState<SkillStatus[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [tab]);

  async function loadData() {
    setLoading(true);
    try {
      switch (tab) {
        case "agents": {
          const data = await getAgents();
          setAgents(data);
          break;
        }
        case "skills": {
          const data = await getSkills();
          setSkills(data);
          break;
        }
        case "audit": {
          const data = await getAudit({ limit: 50 });
          setAudit(data);
          break;
        }
      }
    } catch {
      // API unavailable — show empty state, not fake data
      if (tab === "agents") setAgents([]);
      else if (tab === "skills") setSkills([]);
      else setAudit([]);
    }
    setLoading(false);
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
              v5 · Console
            </span>
          </div>
        </div>
        <div className="flex-1" />
        <button className="w-[30px] h-[30px] rounded-[7px] border border-transparent bg-transparent text-[#52586a] flex items-center justify-center cursor-pointer transition-all hover:bg-[#12161f] hover:border-[rgba(255,255,255,0.05)] hover:text-[#dde2ec]">
          ←
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Tabs sidebar */}
        <aside className="w-[200px] flex-shrink-0 bg-[#0c0f18] border-r border-[rgba(255,255,255,0.05)] flex flex-col p-4 gap-1">
          <div className="flex items-center gap-2 mb-4">
            <IconTerminal2 size={20} className="text-[#d4a05a]" />
            <span className="font-mono text-[11px] text-[#dde2ec] uppercase tracking-wider">
              Console
            </span>
          </div>

          {(["agents", "skills", "audit"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 rounded text-left text-xs font-mono transition-colors ${
                tab === t
                  ? "bg-[rgba(0,200,164,0.13)] text-[#00c8a4] border border-[rgba(0,200,164,0.2)]"
                  : "text-[#52586a] hover:bg-[rgba(255,255,255,0.03)]"
              }`}
            >
              {t === "agents"
                ? "Agents"
                : t === "skills"
                  ? "Kỹ năng"
                  : "Nhật ký"}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 bg-[#070910] overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="font-display text-base font-semibold text-[#dde2ec] mb-4">
              {tab === "agents"
                ? "Trạng thái Agents"
                : tab === "skills"
                  ? "Kỹ năng đã đăng ký"
                  : "Nhật ký hệ thống"}
            </h2>

            {loading ? (
              <div className="text-center text-[#52586a] py-8 font-mono text-xs">
                Đang tải...
              </div>
            ) : tab === "agents" ? (
              <div className="flex flex-col gap-2">
                {agents.map((agent) => (
                  <div
                    key={agent.name}
                    className="bg-[#0c0f18] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex items-center gap-3"
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${agent.status === "active" ? "bg-[#00c8a4] animate-[pulse_2s_ease-in-out_infinite]" : "bg-[rgba(255,255,255,0.1)]"}`}
                    />
                    <div className="flex-1">
                      <span className="text-[13px] text-[#dde2ec] font-medium">
                        {agent.name}
                      </span>
                      <div className="flex gap-3 mt-1">
                        <span className="font-mono text-[9px] text-[#52586a]">
                          Trạng thái:{" "}
                          <span
                            className={
                              agent.status === "active"
                                ? "text-[#00c8a4]"
                                : "text-[#52586a]"
                            }
                          >
                            {agent.status}
                          </span>
                        </span>
                        {agent.call_count_today !== undefined && (
                          <span className="font-mono text-[9px] text-[#52586a]">
                            Gọi hôm nay: {agent.call_count_today}
                          </span>
                        )}
                      </div>
                    </div>
                    {agent.last_called_at && (
                      <span className="font-mono text-[9px] text-[rgba(255,255,255,0.15)]">
                        {new Date(agent.last_called_at).toLocaleTimeString(
                          "vi-VN",
                        )}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : tab === "skills" ? (
              <div className="flex flex-col gap-2">
                {skills.map((skill) => (
                  <div
                    key={skill.name}
                    className="bg-[#0c0f18] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex items-center gap-3"
                  >
                    <div
                      className={`w-[5px] h-[5px] rounded-full ${skill.enabled ? "bg-[#00c8a4]" : "bg-[rgba(255,255,255,0.05)]"}`}
                    />
                    <div className="flex-1">
                      <span className="text-[13px] text-[#dde2ec] font-medium">
                        {skill.name}
                      </span>
                      <p className="text-[11px] text-[#52586a]">
                        {skill.description}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`font-mono text-[9px] ${skill.enabled ? "text-[#00c8a4]" : "text-[#52586a]"}`}
                      >
                        {skill.enabled ? "bật" : "tắt"}
                      </span>
                      <br />
                      <span className="font-mono text-[9px] text-[rgba(255,255,255,0.15)]">
                        v{skill.version}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {audit.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-[#0c0f18] border border-[rgba(255,255,255,0.05)] rounded-lg px-4 py-2 flex items-center gap-3 font-mono text-[10px]"
                  >
                    <span className="text-[#00c8a4]">{entry.action}</span>
                    <span className="text-[#52586a]">
                      {entry.resource_type}
                    </span>
                    {entry.llm_model && (
                      <span className="text-[#8b72f0] bg-[rgba(139,114,240,0.08)] px-1.5 py-0.5 rounded">
                        {entry.llm_model}
                      </span>
                    )}
                    {entry.llm_tokens && (
                      <span className="text-[rgba(255,255,255,0.15)]">
                        {entry.llm_tokens} tokens
                      </span>
                    )}
                    <span className="ml-auto text-[rgba(255,255,255,0.15)]">
                      {new Date(entry.created_at).toLocaleString("vi-VN")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
