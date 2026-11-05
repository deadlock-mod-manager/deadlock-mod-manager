import { expect, test } from "bun:test";
import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";
import { WorkbenchEmptyState } from "./workbench-empty-state";

async function render(addonsEnabled: boolean, disabled = false) {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <WorkbenchEmptyState
        addonsEnabled={addonsEnabled}
        disabled={disabled}
        opening={false}
        onOpenArchive={() => {}}
        onCreateAddon={() => {}}
      />
    </I18nextProvider>,
  );
  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  return {
    html,
    archive: buttons.find((button) => button.includes("Open VPK")),
    addon: buttons.find((button) => button.includes("New addon")),
  };
}

test("VPK browsing stays available before SDK setup, with a reason for disabled addon creation", async () => {
  const { html, archive, addon } = await render(false);
  expect(archive).toBeDefined();
  expect(archive).not.toContain("disabled");
  expect(addon).toContain("disabled");
  expect(addon).toContain('aria-describedby="workbench-create-hint"');
  expect(html).toContain(en.workbenchHome.createHint);
});

test("SDK readiness enables addon creation and removes the setup explanation", async () => {
  const { html, addon } = await render(true);
  expect(addon).toBeDefined();
  expect(addon).not.toContain("disabled");
  expect(html).not.toContain(en.workbenchHome.createHint);
});

test("workspace operations prevent opening another source", async () => {
  const { archive, addon } = await render(true, true);
  expect(archive).toContain("disabled");
  expect(addon).toContain("disabled");
});
