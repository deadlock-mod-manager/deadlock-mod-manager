// oxlint-disable import/no-unassigned-import
import {
  applyHostTheme,
  isEmbedded,
  onHostContext,
} from "@deadlock-mods/plugin-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import i18n from "./i18n";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";

if (isEmbedded()) {
  document.documentElement.dataset.embedded = "";
  onHostContext(({ theme, locale }) => {
    applyHostTheme(theme);
    void i18n.changeLanguage(locale);
  });
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}
