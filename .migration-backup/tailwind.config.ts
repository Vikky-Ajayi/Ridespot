import type { Config } from "tailwindcss";

const config: Config = {
  // Keep this array explicit. If a new class-bearing folder is added,
  // its path must be added here immediately or Tailwind can purge its classes.
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/data/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#13D66E",
          deep: "#0EA85A",
          soft: "#E7FFF0"
        },
        ink: {
          DEFAULT: "#090909",
          soft: "#1C1C1C",
          muted: "#666666"
        },
        canvas: {
          DEFAULT: "#FFFFFF",
          subtle: "#F5F6F8",
          gutter: "#3D434A"
        },
        line: {
          DEFAULT: "#E7E8EC",
          strong: "#D9DBE2"
        },
        success: {
          DEFAULT: "#0A9A56",
          soft: "#E6FAEF"
        },
        danger: {
          DEFAULT: "#FF4545",
          soft: "#FFE9E9"
        },
        demand: {
          "very-high": "#FF4B4B",
          "very-high-soft": "#FFE8E8",
          "very-high-border": "#FFB7B7",
          high: "#FF7A00",
          "high-soft": "#FFF1E6",
          "high-border": "#FFC699",
          medium: "#F6B625",
          "medium-soft": "#FFF8E0",
          "medium-border": "#F7D786",
          low: "#12B76A",
          "low-soft": "#EAFBF1",
          "low-border": "#B2E5C9"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 20px 40px rgba(9, 9, 9, 0.08)",
        sheet: "0 -12px 30px rgba(9, 9, 9, 0.12)"
      },
      borderRadius: {
        "4xl": "2rem"
      },
      backgroundImage: {
        "brand-radial":
          "radial-gradient(circle at top, rgba(19, 214, 110, 0.22), rgba(19, 214, 110, 0) 40%)"
      }
    }
  },
  plugins: []
};

export default config;
