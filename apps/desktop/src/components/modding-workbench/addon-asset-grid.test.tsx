import { expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";

mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: ({ children, disabled }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button disabled={disabled}>{children}</button>
  ),
}));
mock.module("@deadlock-mods/ui/components/input", () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
mock.module("@deadlock-mods/ui/components/badge", () => ({
  Badge: ({ children }: HTMLAttributes<HTMLSpanElement>) => (
    <span>{children}</span>
  ),
}));
mock.module("@deadlock-mods/ui/components/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <button>{children}</button>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  SelectValue: () => null,
}));
mock.module("./asset-thumbnail-renderer", () => ({
  AssetThumbnailRenderer: ({
    path,
    particle,
  }: {
    path: string;
    particle?: ModdingParticleFile;
  }) => <span data-thumbnail-job={path} data-draft-source={particle?.path} />,
}));
const { AddonAssetGrid } = await import("./addon-asset-grid");
const addon: ModdingAddon = {
  id: "fixture",
  name: "fixture",
  sdkRoot: "C:/sdk",
  contentPath: "C:/sdk/content/fixture",
  gamePath: "C:/sdk/game/fixture",
  archivePath: "C:/game/pak01_dir.vpk",
};

async function render(
  files: string[],
  compiled: string[],
  particles: ModdingParticleFile[] = [],
  hierarchy: ModdingHierarchy = "content",
) {
  const client = new QueryClient();
  client.setQueryData(["workbench-batch-files", addon.id, "game", 0], compiled);
  client.setQueryData(["workbench-batch-files", addon.id, hierarchy, 0], files);
  client.setQueryData(["workbench-particle-colors", addon.id, 0], particles);
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <AddonAssetGrid
          addon={addon}
          hierarchy={hierarchy}
          revision={0}
          selected={files[0] ?? ""}
          onSelect={() => {}}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

test("queues one source model thumbnail without requiring Game assets", async () => {
  const html = await render(
    ["models/a.vmdl", "models/b.vmdl", "models/uncompiled.vmdl"],
    [],
  );
  expect(html).toContain('data-thumbnail-job="models/a.vmdl"');
  expect(html.match(/data-thumbnail-job=/g)).toHaveLength(1);
  expect(html).not.toContain("Compile for a preview");
  expect(html).toContain('aria-pressed="true"');
});

test("source particles use the existing draft preview without requiring compiled output", async () => {
  const particle: ModdingParticleFile = {
    path: "particles/custom.vpcf",
    text: "source",
    fingerprint: "hash",
    colors: [],
    diagnostic: null,
  };
  const html = await render([particle.path], [], [particle]);
  expect(html).toContain('data-thumbnail-job="particles/custom.vpcf"');
  expect(html).toContain('data-draft-source="particles/custom.vpcf"');
  expect(html).not.toContain("Compile for a preview");
});

test("invalid particle sources disclose a preview failure and do not block the queue", async () => {
  const particle: ModdingParticleFile = {
    path: "particles/broken.vpcf",
    text: "broken",
    fingerprint: "hash",
    colors: [],
    diagnostic: "Invalid source",
  };
  const html = await render(
    [particle.path, "models/valid.vmdl"],
    ["models/valid.vmdl_c"],
    [particle],
  );
  expect(html).toContain("Preview unavailable");
  expect(html).toContain('data-thumbnail-job="models/valid.vmdl"');
});
