// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

import node from "@astrojs/node";

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

  output: "server",

  adapter: node({
    mode: "standalone",
  }),
});

