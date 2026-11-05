import { expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import type { ButtonHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";

const mod = {
  id: "downloaded-skin",
  name: "Downloaded skin",
  status: "downloaded",
};
mock.module("@/lib/store", () => ({
  usePersistedStore: <T,>(
    select: (state: { localMods: (typeof mod)[] }) => T,
  ) => select({ localMods: [mod] }),
}));
mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: ({ children, disabled }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button disabled={disabled}>{children}</button>
  ),
}));
const { VpkSources } = await import("./vpk-sources");

test("downloaded mods expose their cached VPKs without an installed game copy", async () => {
  const client = new QueryClient();
  client.setQueryData(
    ["workbench-library-vpks", mod.id],
    [
      {
        filePath: "/mod-cache/downloaded-skin/files/skin.vpk",
        label: "files/skin.vpk",
      },
    ],
  );
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <VpkSources disabled={false} onOpen={() => {}} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  expect(html).toContain("Mods library (1)");
  expect(html).toContain("Downloaded skin");
  expect(html).toContain('title="/mod-cache/downloaded-skin/files/skin.vpk"');
  expect(html).toContain('draggable="true"');
  expect(html).not.toContain("No VPK files found");
});
