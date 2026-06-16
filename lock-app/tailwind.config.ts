import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { navy: "#041E42", gold: "#FDDA24" },
    },
  },
  plugins: [],
};
export default config;
