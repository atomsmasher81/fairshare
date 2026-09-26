import type { Config } from "tailwindcss";

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        card: token("card"),
        sunken: token("sunken"),
        raised: token("raised"),
        fg: token("fg"),
        muted: token("muted"),
        faint: token("faint"),
        line: token("line"),
        ink: token("ink"),
        "ink-fg": token("ink-fg"),
        pos: token("pos"),
        neg: token("neg"),
        danger: token("danger"),
        essential: token("essential"),
        semi: token("semi"),
        luxury: token("luxury"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      keyframes: {
        "sheet-in": { from: { transform: "translateY(100%)" }, to: { transform: "translateY(0)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "rise-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "sheet-in": "sheet-in 260ms cubic-bezier(0.32, 0.72, 0, 1)",
        "fade-in": "fade-in 180ms ease-out",
        "rise-in": "rise-in 220ms cubic-bezier(0.32, 0.72, 0, 1) both",
      },
    },
  },
  plugins: [],
};
export default config;
