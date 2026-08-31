import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";

const AGENT = process.env.IHELLO_AGENT_URL || "http://127.0.0.1:8787";

export default defineConfig({
  base: "/admin/",
  // Vite 8 / Rolldown CJS interop can break react/jsx-runtime named exports in dev.
  legacy: {
    inconsistentCjsInterop: true,
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: [
      "react",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-dom",
      "react-dom/client",
      "radix-ui",
      "sonner",
    ],
  },
  server: {
    port: 3000,
    proxy: {
      "/api": AGENT,
      "/config": AGENT,
      "/feedback": AGENT,
      "/agents": { target: AGENT, ws: true },
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      spa: { enabled: true },
      router: { basepath: "/admin" },
    }),
    viteReact(),
  ],
});
