import { describe, expect, it } from "bun:test";
import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";
import { VideoEmbed } from "./video-embed";

const i18n = createInstance();
await i18n.init({
  lng: "en",
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

describe("video playback gating", () => {
  it.each([true, false])(
    "respects disabled=%s on the play control",
    (disabled) => {
      const html = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <VideoEmbed
            disabled={disabled}
            title='Example video'
            video={{ provider: "youtube", id: "Xw0wI89x3fc" }}
          />
        </I18nextProvider>,
      );
      expect(/<button[^>]*disabled/.test(html)).toBe(disabled);
      expect(html).not.toContain("<iframe");
    },
  );
});
