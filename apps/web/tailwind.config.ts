import type { Config } from "tailwindcss";

/** Cineforge tokens resolve through CSS variables (see app/globals.css), so the
 *  same component renders correctly in a light "paper" room or a dark room. */
const cf = (name: string) => `rgb(var(--cf-${name}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cf: {
          bg: cf("bg"),
          panel: cf("panel"),
          soft: cf("soft"),
          fg: cf("fg"),
          muted: cf("muted"),
          dim: cf("dim"),
          line: cf("line"),
          line2: cf("line2"),
          accent: cf("accent"),
          inverse: cf("inverse"),
          "on-inverse": cf("on-inverse"),
          ok: cf("ok"),
          warn: cf("warn"),
          danger: cf("danger"),
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Manrope", "Inter", "sans-serif"],
        serif: ["Georgia", '"Times New Roman"', "serif"],
        mono: ['"DM Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
