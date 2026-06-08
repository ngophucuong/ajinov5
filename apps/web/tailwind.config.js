/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Exo 2'", "sans-serif"],
        body: ["'DM Sans'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        bg: "#070910",
        s1: "#0c0f18",
        s2: "#12161f",
        b1: "rgba(255,255,255,0.05)",
        b2: "rgba(255,255,255,0.09)",
        b3: "rgba(255,255,255,0.15)",
        tx: "#dde2ec",
        mu: "#52586a",
        te: "#00c8a4",
        te0: "rgba(0,200,164,0.06)",
        te1: "rgba(0,200,164,0.13)",
        te2: "rgba(0,200,164,0.28)",
        go: "#d4a05a",
        go0: "rgba(212,160,90,0.08)",
        pu: "#8b72f0",
        pu0: "rgba(139,114,240,0.08)",
        co: "#e06868",
        co0: "rgba(224,104,104,0.09)",
      },
    },
  },
  plugins: [],
};
