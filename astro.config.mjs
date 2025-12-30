// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
  i18n: {
    locales: ["it", "en", "de"],
    defaultLocale: "en",
    routing: {
      prefixDefaultLocale: false,
    },
  },
});

