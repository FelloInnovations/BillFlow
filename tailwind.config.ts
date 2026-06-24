import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    screens: {
      xs: "480px",
      sm: "768px",
      md: "1024px",
      lg: "1440px",
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      colors: {
        primary: {
          25: "#FFF9F8", 50: "#FDF1EF", 100: "#FDE7E3", 200: "#FFC7BE",
          300: "#FFAA9D", 400: "#FF8E7D", 500: "#FF725C", 600: "#E66753",
          700: "#CC5B4A", 800: "#B35040", 900: "#994437",
        },
        secondary: {
          25: "#F9FFFF", 50: "#E7FDFD", 100: "#CAFBFB", 200: "#83F5F7",
          300: "#46E6E8", 400: "#0ED4D7", 500: "#0DC1C4", 600: "#0BA5A7",
          700: "#098486", 800: "#076C6E", 900: "#055051",
        },
        "primary-text": {
          25: "#F8F8FA", 50: "#F0F2F5", 100: "#E2E4EB", 200: "#D3D7E1",
          300: "#C5C9D7", 400: "#9298A9", 500: "#6B748E", 600: "#495883",
          700: "#353E5A", 800: "#222A3F", 900: "#111729",
        },
        "secondary-text": {
          25: "#F7F9FA", 50: "#F1F4F7", 100: "#E8ECF1", 200: "#CCD6DC",
          300: "#BDC8D3", 400: "#A9B9C8", 500: "#8EA1AF", 600: "#677B89",
          700: "#3C5A6F", 800: "#093555", 900: "#052033",
        },
        success: {
          50: "#E3FCEF", 100: "#ABF5D1", 300: "#57D9A3",
          500: "#36B37E", 600: "#31A172", 700: "#2B8D64",
        },
        warning: {
          50: "#FFFAE6", 100: "#FFF0B3", 300: "#FFC400",
          500: "#FF991F", 600: "#F08400",
        },
        error: {
          50: "#FFEBE6", 100: "#FFBDAD", 300: "#FF7452",
          500: "#FF431B", 600: "#F02C00",
        },
        blue: {
          50: "#F0F7FF", 100: "#E7F1FE", 300: "#B6D6FB",
          500: "#6EAEF7", 600: "#3D93F5",
        },
        purple: {
          50: "#F4F3FF", 100: "#F2EDFC", 300: "#D3C6F6",
          500: "#AB91ED", 600: "#8D6AE7",
        },
      },
      borderRadius: {
        none: "0px",
        DEFAULT: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "20px",
        full: "9999px",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgba(73,88,131,0.08)",
        sm: "0 1px 2px 0 rgba(73,88,131,0.04), 0 1px 3px 0 rgba(73,88,131,0.16)",
        md: "0 2px 4px -2px rgba(73,88,131,0.04), 0 4px 8px -2px rgba(73,88,131,0.16)",
        lg: "0 4px 6px -2px rgba(73,88,131,0.04), 0 12px 16px -4px rgba(73,88,131,0.16)",
        xl: "0 8px 8px -4px rgba(73,88,131,0.04), 0 20px 24px -4px rgba(73,88,131,0.16)",
        "2xl": "0 24px 48px -12px rgba(73,88,131,0.16)",
      },
    },
  },
  plugins: [],
};

export default config;
