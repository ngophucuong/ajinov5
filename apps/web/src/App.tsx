import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import Chat from "./pages/Chat";
import Memory from "./pages/Memory";
import Capture from "./pages/Capture";
import Studio from "./pages/Studio";
import Console from "./pages/Console";
import Admin from "./pages/Admin";

// ─── Navigation sidebar (for non-chat pages) ──────────
function NavSidebar() {
  const links = [
    { to: "/", label: "Chat", emoji: "💬" },
    { to: "/memory", label: "Bộ nhớ", emoji: "🧠" },
    { to: "/capture", label: "Capture", emoji: "⚡" },
    { to: "/studio", label: "Studio", emoji: "📚" },
    { to: "/console", label: "Console", emoji: "⌨️" },
    { to: "/admin", label: "Quản trị", emoji: "🛡️" },
  ];

  return (
    <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-1 bg-[#0c0f18] border border-[rgba(255,255,255,0.09)] rounded-xl px-2 py-1.5 z-50 shadow-lg">
      {links.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className="px-3 py-1 rounded-lg text-[10px] font-mono text-[#52586a] hover:text-[#dde2ec] hover:bg-[rgba(255,255,255,0.03)] transition-colors"
        >
          {l.emoji} {l.label}
        </Link>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="relative h-full">
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/chat" element={<Navigate to="/" replace />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/capture" element={<Capture />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/console" element={<Console />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <NavSidebar />
      </div>
    </BrowserRouter>
  );
}
