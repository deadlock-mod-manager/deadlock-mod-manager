import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";
import type { FoundryModel } from "@/types/foundry";
import type { ModelPreviewIssue } from "@/types/generated/ModelPreviewIssue";
import { PreviewDiagnostics } from "./preview-diagnostics";

const render = async (issues: ModelPreviewIssue[], animationFailed = false) => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  const model: FoundryModel = {
    assetId: "preview-test",
    filePath: "model.glb",
    byteLength: 100,
    vertexCount: 3,
    indexCount: 3,
    report: {
      issues,
      dependencies: [
        {
          path: "body.vmdl_c",
          archive: "C:/private-game/pak01.vpk",
          overlay: false,
        },
      ],
      truncated: false,
    },
  };
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={i18n}>
        <PreviewDiagnostics model={model} animationFailed={animationFailed} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
};

test("a healthy preview has no diagnostics overlay", async () => {
  expect(await render([])).toBe("");
});

test("partial previews show each explanation once without exposing raw support data", async () => {
  const html = await render([
    {
      kind: "missingDependency",
      path: "body.vtex_c",
      detail: "Missing body texture",
    },
    {
      kind: "missingDependency",
      path: "head.vtex_c",
      detail: "Missing head texture",
    },
  ]);
  expect(html).toContain(en.modPreview.partial);
  expect(html.split(en.modPreview.issues.missingDependency)).toHaveLength(2);
  expect(html).toContain(en.modPreview.copySupportDetails);
  for (const raw of [
    "<pre",
    "body.vtex_c",
    "head.vtex_c",
    "private-game",
    "dependencies",
  ])
    expect(html).not.toContain(raw);
});

test("animation failure keeps its actionable explanation", async () => {
  expect(await render([], true)).toContain(en.modPreview.issues.animation);
});
