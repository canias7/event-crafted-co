import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      // Page edge: 20px on phones, 32px from tablet up (the brand standard).
      padding: { DEFAULT: "1.25rem", md: "2rem" },
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // Brand rule: Libre Baskerville for all text, so `sans` points at it too.
        sans: ['Libre Baskerville', 'Georgia', 'Times New Roman', 'serif'],
        serif: ['Libre Baskerville', 'Georgia', 'Times New Roman', 'serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        placeholder: "hsl(var(--placeholder))",
        pending: "hsl(var(--pending))",
        // Champagne: the primary button fill (ink label), plus ornament.
        gold: {
          DEFAULT: "hsl(var(--gold))",
          hover: "hsl(var(--gold-hover))",
          muted: "hsl(var(--gold-muted))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      // Corner scale shared with the apps: sm 4 (checkboxes), md 8 (tags),
      // lg/xl 12 (inputs, tiles, menus), 2xl 20 (cards), 3xl 24 (sheets,
      // modals), full (buttons, chips, status pills).
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        "2xl": "20px",
      },
      // Two shadows only. Cards are flat (hairline border, no shadow).
      boxShadow: {
        // Floating things: menus, popovers, toasts, sticky bars.
        soft: "0 6px 18px -8px hsl(220 14% 9% / 0.18)",
        // Modals and sheets.
        lifted: "0 24px 48px -18px hsl(220 14% 9% / 0.35)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "marquee-x": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "marquee-x": "marquee-x 18s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
