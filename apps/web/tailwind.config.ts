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
        rule: "#0f766e",
        caution: "#b45309",
        panel: "#ffffff",
        chrome: "#eef2f7"
      },
      boxShadow: {
        panel: "0 1px 2px rgba(16, 24, 40, 0.06)",
        elevated: "0 12px 28px rgba(16, 24, 40, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
