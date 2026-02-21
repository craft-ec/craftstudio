/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        craftec: {
          50: "#f0f4ff",
          100: "#dbe4ff",
          200: "#bac8ff",
          300: "#91a7ff",
          400: "#748ffc",
          500: "#5c7cfa",
          600: "#4c6ef5",
          700: "#4263eb",
          800: "#3b5bdb",
          900: "#364fc7",
        },
        theme: {
          bg: "#f8fafc",     // Very light slate for background
          card: "#ffffff",   // Pure white for cards
          border: "#e2e8f0", // Light border
          text: "#0f172a",   // Dark slate for primary text
          muted: "#64748b"   // Muted slate for secondary text
        }
      },
      animation: {
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      boxShadow: {
        'glass': '0 4px 24px rgba(0, 0, 0, 0.04)',
        'glass-hover': '0 8px 32px rgba(0, 0, 0, 0.06)'
      }
    },
  },
  plugins: [],
};
