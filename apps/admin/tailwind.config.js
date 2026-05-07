/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        ink: "hsl(220 14% 11%)",
        bone: "hsl(36 30% 97%)",
        gold: "hsl(38 45% 62%)",
      },
    },
  },
  plugins: [],
};
