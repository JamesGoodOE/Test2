import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          500: "#2f5fe0",
          600: "#1f47c2",
          700: "#183a9e",
        },
        tier: {
          prohibited: "#b91c1c",
          high: "#c2410c",
          limited: "#a16207",
          minimal: "#15803d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
