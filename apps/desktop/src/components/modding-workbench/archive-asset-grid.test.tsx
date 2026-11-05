import { expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import type { ButtonHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";
import type { ModdingArchiveEntry } from "@/types/generated/ModdingArchiveEntry";

mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: ({ children, disabled }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button disabled={disabled}>{children}</button>
  ),
}));
mock.module("./asset-thumbnail-renderer", () => ({
  AssetThumbnailRenderer: ({
    archivePath,
    path,
  }: {
    archivePath: string;
    path: string;
  }) => <span data-archive={archivePath} data-thumbnail={path} />,
}));
const { ArchiveAssetGrid, archiveAssetsKey } =
  await import("./archive-asset-grid");

async function render(count: number) {
  const archivePath = "/library/downloaded.vpk";
  const entries: ModdingArchiveEntry[] = Array.from(
    { length: count },
    (_, index) => ({
      path: `models/nested/${index}.vmdl_c`,
      name: `${index}.vmdl_c`,
      directory: false,
      fileCount: 1,
      size: 10n,
    }),
  );
  const client = new QueryClient();
  client.setQueryData(archiveAssetsKey(archivePath, "", "", false), entries);
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ArchiveAssetGrid
          archivePath={archivePath}
          directory=''
          search=''
          regex={false}
          selected={entries[0]?.path ?? ""}
          selection={new Map()}
          disabled={false}
          onPreview={() => {}}
          onSelect={() => {}}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

test("archive grid previews the opened archive and paginates selectable assets", async () => {
  const html = await render(30);
  expect(html).toContain('data-archive="/library/downloaded.vpk"');
  expect(html).toContain('data-thumbnail="models/nested/0.vmdl_c"');
  expect(html.match(/type="checkbox"/g)).toHaveLength(24);
  expect(html).not.toContain('title="models/nested/24.vmdl_c"');
  expect(html).toContain('aria-pressed="true"');
});

test("empty archives show the next-action empty state", async () => {
  const html = await render(0);
  expect(html).not.toContain("data-thumbnail=");
  expect(html).toContain('role="status"');
});
