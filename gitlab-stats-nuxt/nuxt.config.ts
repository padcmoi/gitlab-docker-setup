export default defineNuxtConfig({
  compatibilityDate: "2025-01-01",
  devtools: { enabled: false },

  modules: ["@nuxt/ui", "nuxt-auth-utils"],

  css: ["~/assets/css/main.css"],

  ui: {
    colorMode: true,
  },

  nitro: {
    preset: "node-server",
  },
});
