/** @type {import("tailwindcss").Config} */
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Manrope", "system-ui", "sans-serif"],
        sans: ["Manrope", "system-ui", "sans-serif"]
      },
      colors: {
        primary: "#137fec",
        "primary-dark": "#0b5ec2",
        "background-light": "#f6f7f8",
        "background-dark": "#101922",
        "surface-light": "#ffffff",
        "surface-dark": "#1a2632",
        "text-main": "#0d141b",
        "text-secondary": "#4c739a",
        success: "#078838"
      },
      boxShadow: {
        soft: "0 2px 10px rgba(0, 0, 0, 0.03)"
      }
    }
  },
  plugins: []
};
