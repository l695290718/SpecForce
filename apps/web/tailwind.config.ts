import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "#d9e0ea",
        surface: "#f4f6f9",
        ink: "#172033",
        muted: "#667085",
        accent: "#2563eb",
        accent2: "#7c3aed",
        rule: "#0f766e",
        caution: "#b45309",
        panel: "#ffffff",
        chrome: "#eef2f7"
      },
      boxShadow: {
        panel: "0 1px 2px rgba(16, 24, 40, 0.06)",
        elevated: "0 12px 28px rgba(16, 24, 40, 0.08)",
        glow: "0 0 0 1px rgba(59, 130, 246, 0.16), 0 10px 32px rgba(37, 99, 235, 0.18)",
        "glow-strong": "0 0 0 1px rgba(124, 58, 237, 0.22), 0 14px 44px rgba(79, 70, 229, 0.32)",
        deck: "0 18px 48px rgba(2, 8, 23, 0.35)"
      },
      keyframes: {
        "sf-shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        },
        "sf-drift": {
          "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "50%": { transform: "translate3d(2%, -2%, 0) scale(1.06)" }
        }
      },
      animation: {
        "sf-shimmer": "sf-shimmer 6s linear infinite",
        "sf-drift": "sf-drift 18s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
