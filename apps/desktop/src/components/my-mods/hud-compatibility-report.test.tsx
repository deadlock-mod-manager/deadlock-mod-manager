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
  expect(html).toContain("Game log unavailable");
  expect(html).toContain("They don’t mean the mod is broken");
  expect(html).toContain("launch isn’t blocked");
  expect(html).toContain("Test HUD");
  expect(html).toContain(en.bisect.entry);
  expect(html).not.toContain("<button");
});

test("successful checks collapse into a count while findings remain available", async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  const clean: HudCheck = {
    modId: "hud",
    sourceVpk: "pak01_dir.vpk",
    filePath: "panorama/layout/clean.vxml_c",
    status: "compared",
    missingPanels: [],
    detail: null,
    console: { modifiedAt: null, truncated: false, error: null, lines: [] },
  };
  const checks: HudCheck[] = [
    ...Array.from({ length: 25 }, (_, index) => ({
      ...clean,
      filePath: `panorama/layout/clean-${index}.vxml_c`,
    })),
    {
      ...clean,
      filePath: "panorama/layout/changed.vxml_c",
      missingPanels: ["BuyButton"],
    },
    {
      ...clean,
      filePath: "panorama/layout/custom.vxml_c",
      status: "noBaseline",
    },
  ];
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <HudCompatibilityReport
        checks={checks}
        modNames={new Map([["hud", "Test HUD"]])}
      />
    </I18nextProvider>,
  );
  expect(html).toContain("27 layouts, 25 with no findings");
  expect(html).not.toContain("clean-0.vxml_c");
  expect(html).toContain("BuyButton");
  expect(html).toContain("No matching game layout");
  expect(html).toContain("1 panel left out");
  expect(html).not.toContain(" open=");
  expect(html.match(/<summary/g)).toHaveLength(4);
  expect(html).not.toContain("<details open");
});
