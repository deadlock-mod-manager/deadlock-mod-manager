import { browser } from "@wdio/globals";
import { step } from "./evidence";

type DeepLinkData = { download_url: string; mod_type: string; mod_id: string };

/**
 * E2E builds skip the deep-link plugin's setup and the single-instance plugin,
 * so nothing outside the app can open a link. This emits the event the Rust
 * handler emits after validating a `deadlock-mod-manager:` URL.
 */
export const sendDeepLink = (modId: string, fileId: number) =>
  step(`open 1-click link for ${modId}/${fileId}`, () =>
    browser.execute(
      (payload: DeepLinkData) =>
        window["__TAURI_INTERNALS__"].invoke("plugin:event|emit", {
          event: "deep-link-received",
          payload,
        }),
      {
        download_url: `https://gamebanana.com/mmdl/${fileId}`,
        mod_type: "mod",
        mod_id: modId,
      },
    ),
  );

/** Sonner toasts currently on screen. */
export const visibleToasts = () =>
  browser.execute(() =>
    Array.from(document.querySelectorAll("[data-sonner-toast]")).map(
      (toast) => toast.textContent ?? "",
    ),
  );
