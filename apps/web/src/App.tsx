import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import Chat from "./pages/Chat";
import Memory from "./pages/Memory";
import Capture from "./pages/Capture";
import Studio from "./pages/Studio";
import Console from "./pages/Console";
import Admin from "./pages/Admin";
import Miniapp from "./pages/Miniapp";

// ─── Floating Nav Chips (collapsible, blur backdrop) ──
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
    <nav
      className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-0.5 px-1.5 py-1 rounded-t-xl z-50 transition-all duration-300 ease-out group hover:py-2 hover:gap-1 hover:px-2"
      style={{
        background: "rgba(12, 15, 24, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "0.5px solid rgba(255,255,255,0.06)",
        borderBottom: "none",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.3)",
      }}
    >
      {links.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          title={l.label}
          className="px-2 py-0.5 rounded-lg text-[10px] font-mono text-[#52586a] hover:text-[#dde2ec] hover:bg-[rgba(255,255,255,0.05)] transition-all duration-200 whitespace-nowrap opacity-60 group-hover:opacity-100"
        >
          <span className="mr-1">{l.emoji}</span>
          <span className="hidden group-hover:inline transition-opacity duration-200">
            {l.label}
          </span>
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
          <Route path="/miniapp" element={<Miniapp />} />
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
