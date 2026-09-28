import { StrictMode, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

/**
 * Cloudflare ASSETS serves the same prerendered SPA shell for every /admin/*
 * deep link. hydrateRoot then compares that `/`-masked HTML to the real route
 * and throws React #418. Client-render instead — shell still paints CSS/JS;
 * React replaces the document without a hydration check.
 */
startTransition(() => {
  createRoot(document).render(
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
