import { describe, expect, it, mock } from "bun:test";
import { createInstance } from "i18next";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";

mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: ({ children }: { children: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));
mock.module("@deadlock-mods/ui/icons", () => ({ ExternalLink: () => <svg /> }));

const { UpdateChannelNotes } = await import("./update-channel-notes");

async function render(windows: boolean) {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <UpdateChannelNotes id='notes' windows={windows} />
    </I18nextProvider>,
  );
}

describe("update channel notes", () => {
  it("warns Windows users about nightly test signing", async () => {
    const html = await render(true);
    expect(html).toContain(en.settings.updateChannelNightlyNote);
    expect(html).toContain(en.settings.updateChannelNightlyWindowsNote);
    expect(html).toContain(en.settings.updateChannelRollbackGuide);
  });

  it("omits the signing warning on other platforms", async () => {
    const html = await render(false);
    expect(html).toContain(en.settings.updateChannelNightlyNote);
    expect(html).not.toContain(en.settings.updateChannelNightlyWindowsNote);
  });
});
