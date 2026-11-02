import { expect, test } from "bun:test";
import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";
import type { HudCheck } from "@/types/generated/HudCheck";
import { HudCompatibilityReport } from "./hud-compatibility-report";

test("incomplete HUD coverage remains visible without missing panels or log evidence", async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  const check: HudCheck = {
    modId: "provider:hud",
    sourceVpk: "shard2/pak01_dir.vpk",
    filePath: "panorama/layout/hud.vxml_c",
    status: "unsupported",
    missingPanels: [],
    detail: "Missing LaCo",
    console: {
      modifiedAt: null,
      truncated: false,
      error: "not found",
      lines: [],
    },
  };
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <HudCompatibilityReport
        checks={[check]}
        modNames={new Map([[check.modId, "Test HUD"]])}
      />
    </I18nextProvider>,
  );
  expect(html).toContain("Couldn’t check this layout format");
  expect(html).toContain("Couldn’t read the game log");
  expect(html).toContain("doesn’t prove this mod caused it");
  expect(html).toContain("stop you from launching");
  expect(html).toContain("Test HUD");
  expect(html).toContain(en.bisect.entry);
  expect(html).not.toContain("<button");
});
