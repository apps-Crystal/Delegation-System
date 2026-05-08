import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light app surfaces
        bg: {
          base: "#f4f6fa",     // app background
          surface: "#ffffff",  // card background
          elevated: "#f8fafc", // hover / subtle inset
          hover: "#eef2f7",
        },
        border: {
          subtle: "#eef0f4",
          DEFAULT: "#e2e6ec",
          strong: "#cbd2da",
        },
        text: {
          primary: "#0f172a",
          secondary: "#475569",
          muted: "#64748b",
        },
        // Navy sidebar palette
        nav: {
          base: "#0f2747",     // sidebar background
          elevated: "#15315a", // active row background
          border: "#1d3a66",
          text: "#cdd6e2",
          muted: "#7e8ca0",
          active: "#f0b53d",   // gold accent
        },
        accent: {
          DEFAULT: "#0f2747",
          hover: "#15315a",
          gold: "#f0b53d",
          goldHover: "#dba32f",
        },
        status: {
          pending: "#d97706",
          followup: "#2563eb",
          hold: "#7c3aed",
          complete: "#059669",
          revise: "#dc2626",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 0 0 1px rgba(15, 23, 42, 0.04)",
        glow: "0 0 0 1px rgba(240, 181, 61, 0.4), 0 4px 16px -4px rgba(240, 181, 61, 0.2)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in": "slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
