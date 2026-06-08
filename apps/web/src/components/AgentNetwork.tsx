import { useEffect, useRef } from "react";

// ─── Agent Network SVG — 6 nodes with animated particles ─────
// Coordinates from design HTML <svg id="agNet" viewBox="0 0 212 308">
// 6 agents: ORCH(106,44), RSN(48,128), SRC(164,128),
//           MEM(48,228), KNW(164,228), SYN(106,279)

export default function AgentNetwork() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    // Force animations to run by re-triggering
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    svg.parentNode?.replaceChild(clone, svg);
    // The ref still points to old element, but animations restart
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 212 308"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full block"
      style={{ height: "auto" }}
    >
      <defs>
        <radialGradient id="gOrch" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#d4a05a" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#d4a05a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gTe" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00c8a4" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#00c8a4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gPu" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8b72f0" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#8b72f0" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Edge: ORCH → RSN (teal, dash) */}
      <line x1="106" y1="63" x2="48" y2="128" stroke="#00c8a4" strokeWidth="0.7" strokeOpacity="0.22" strokeDasharray="3,3">
        <animate attributeName="stroke-dashoffset" from="0" to="-12" dur="1.2s" repeatCount="indefinite" />
      </line>
      {/* Edge: ORCH → SRC (teal, dash) */}
      <line x1="106" y1="63" x2="164" y2="128" stroke="#00c8a4" strokeWidth="0.7" strokeOpacity="0.22" strokeDasharray="3,3">
        <animate attributeName="stroke-dashoffset" from="0" to="-12" dur="0.9s" repeatCount="indefinite" />
      </line>
      {/* Edge: RSN → MEM (purple, dash) */}
      <line x1="48" y1="146" x2="94" y2="268" stroke="#8b72f0" strokeWidth="0.7" strokeOpacity="0.2" strokeDasharray="3,3">
        <animate attributeName="stroke-dashoffset" from="0" to="-12" dur="1.5s" repeatCount="indefinite" />
      </line>
      {/* Edge: SRC → KNW (teal, dash) */}
      <line x1="164" y1="146" x2="118" y2="268" stroke="#00c8a4" strokeWidth="0.7" strokeOpacity="0.18" strokeDasharray="3,3">
        <animate attributeName="stroke-dashoffset" from="0" to="-12" dur="1.1s" repeatCount="indefinite" />
      </line>
      {/* Faint cross edges */}
      <line x1="106" y1="63" x2="48" y2="218" stroke="white" strokeWidth="0.4" strokeOpacity="0.04" />
      <line x1="106" y1="63" x2="164" y2="218" stroke="white" strokeWidth="0.4" strokeOpacity="0.04" />

      {/* Animated particles on edges */}
      <circle r="2.2" fill="#00c8a4" opacity="0">
        <animateMotion dur="1.8s" repeatCount="indefinite" path="M106,63 L48,128" />
        <animate attributeName="opacity" values="0;0.95;0" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle r="2.2" fill="#00c8a4" opacity="0">
        <animateMotion dur="1.4s" repeatCount="indefinite" path="M106,63 L164,128" begin="0.4s" />
        <animate attributeName="opacity" values="0;0.95;0" dur="1.4s" repeatCount="indefinite" begin="0.4s" />
      </circle>
      <circle r="2" fill="#8b72f0" opacity="0">
        <animateMotion dur="2s" repeatCount="indefinite" path="M48,146 L94,268" begin="0.7s" />
        <animate attributeName="opacity" values="0;0.85;0" dur="2s" repeatCount="indefinite" begin="0.7s" />
      </circle>
      <circle r="2" fill="#00c8a4" opacity="0">
        <animateMotion dur="1.7s" repeatCount="indefinite" path="M164,146 L118,268" begin="1.1s" />
        <animate attributeName="opacity" values="0;0.85;0" dur="1.7s" repeatCount="indefinite" begin="1.1s" />
      </circle>

      {/* Node 1: ORCH — Orchestrator */}
      <circle cx="106" cy="44" r="30" fill="url(#gOrch)">
        <animate attributeName="r" values="30;35;30" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="106" cy="44" r="19" fill="#0c0f18" stroke="#d4a05a" strokeWidth="1">
        <animate attributeName="stroke-opacity" values="1;0.45;1" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <text x="106" y="41" fontFamily="'Exo 2',sans-serif" fontSize="7" fontWeight="600" fill="#d4a05a" textAnchor="middle" letterSpacing="0.8">ORCH</text>
      <text x="106" y="51" fontFamily="'Exo 2',sans-serif" fontSize="5.5" fill="#8a6030" textAnchor="middle" letterSpacing="0.5">estrator</text>

      {/* Node 2: RSN — Reasoning */}
      <circle cx="48" cy="137" r="22" fill="url(#gPu)">
        <animate attributeName="r" values="22;26;22" dur="3.6s" repeatCount="indefinite" />
      </circle>
      <circle cx="48" cy="137" r="13" fill="#0c0f18" stroke="#8b72f0" strokeWidth="0.8">
        <animate attributeName="stroke-opacity" values="1;0.38;1" dur="3.3s" repeatCount="indefinite" />
      </circle>
      <text x="48" y="135" fontFamily="'JetBrains Mono',monospace" fontSize="5.5" fill="#a48df5" textAnchor="middle">RSN</text>
      <text x="48" y="143" fontFamily="'JetBrains Mono',monospace" fontSize="4.5" fill="#5c4fa0" textAnchor="middle">agent</text>

      {/* Node 3: SRC — Search */}
      <circle cx="164" cy="137" r="22" fill="url(#gTe)">
        <animate attributeName="r" values="22;26;22" dur="2.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="164" cy="137" r="13" fill="#0c0f18" stroke="#00c8a4" strokeWidth="0.8">
        <animate attributeName="stroke-opacity" values="1;0.38;1" dur="2.6s" repeatCount="indefinite" />
      </circle>
      <text x="164" y="135" fontFamily="'JetBrains Mono',monospace" fontSize="5.5" fill="#00c8a4" textAnchor="middle">SRC</text>
      <text x="164" y="143" fontFamily="'JetBrains Mono',monospace" fontSize="4.5" fill="#006e58" textAnchor="middle">agent</text>

      {/* Node 4: MEM — Memory (dim/idle) */}
      <circle cx="48" cy="228" r="13" fill="#0c0f18" stroke="rgba(255,255,255,0.1)" strokeWidth="0.6" />
      <text x="48" y="226" fontFamily="'JetBrains Mono',monospace" fontSize="5.5" fill="rgba(255,255,255,0.18)" textAnchor="middle">MEM</text>
      <text x="48" y="234" fontFamily="'JetBrains Mono',monospace" fontSize="4.5" fill="rgba(255,255,255,0.08)" textAnchor="middle">agent</text>

      {/* Node 5: KNW — Knowledge (dim/idle) */}
      <circle cx="164" cy="228" r="13" fill="#0c0f18" stroke="rgba(255,255,255,0.1)" strokeWidth="0.6" />
      <text x="164" y="226" fontFamily="'JetBrains Mono',monospace" fontSize="5.5" fill="rgba(255,255,255,0.18)" textAnchor="middle">KNW</text>
      <text x="164" y="234" fontFamily="'JetBrains Mono',monospace" fontSize="4.5" fill="rgba(255,255,255,0.08)" textAnchor="middle">agent</text>

      {/* Node 6: SYN — Synthesis */}
      <circle cx="106" cy="279" r="22" fill="url(#gPu)">
        <animate attributeName="r" values="22;26;22" dur="4.1s" repeatCount="indefinite" />
      </circle>
      <circle cx="106" cy="279" r="13" fill="#0c0f18" stroke="#8b72f0" strokeWidth="0.8">
        <animate attributeName="stroke-opacity" values="1;0.38;1" dur="3.8s" repeatCount="indefinite" />
      </circle>
      <text x="106" y="277" fontFamily="'JetBrains Mono',monospace" fontSize="5.5" fill="#a48df5" textAnchor="middle">SYN</text>
      <text x="106" y="285" fontFamily="'JetBrains Mono',monospace" fontSize="4.5" fill="#5c4fa0" textAnchor="middle">agent</text>

      {/* Labels */}
      <text x="48" y="159" fontFamily="'DM Sans',sans-serif" fontSize="6" fill="rgba(255,255,255,0.2)" textAnchor="middle">Reasoning</text>
      <text x="164" y="159" fontFamily="'DM Sans',sans-serif" fontSize="6" fill="rgba(255,255,255,0.2)" textAnchor="middle">Search</text>
      <text x="48" y="249" fontFamily="'DM Sans',sans-serif" fontSize="6" fill="rgba(255,255,255,0.1)" textAnchor="middle">Memory</text>
      <text x="164" y="249" fontFamily="'DM Sans',sans-serif" fontSize="6" fill="rgba(255,255,255,0.1)" textAnchor="middle">Knowledge</text>
      <text x="106" y="300" fontFamily="'DM Sans',sans-serif" fontSize="6" fill="rgba(255,255,255,0.2)" textAnchor="middle">Synthesis</text>
    </svg>
  );
}
