import { describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ButtonHTMLAttributes } from "react";
import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";
import type { BatchUpdateFailure } from "@/lib/mods/batch-update-failures";
import type { BatchUpdateResult } from "@/types/mods";

mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: Pick<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "onClick" | "disabled"
  >) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
mock.module("@deadlock-mods/ui/icons", () => ({ AlertCircle: () => <svg /> }));

const { BatchUpdateFailureDetails } =
  await import("./batch-update-failure-details");

async function render(
  failure?: BatchUpdateFailure,
  result?: BatchUpdateResult,
) {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={i18n}>
        <BatchUpdateFailureDetails
          failure={failure}
          result={result}
          mods={[{ remoteId: "42", name: "Billy skin" }]}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}
describe("batch update failure details", () => {
  it("shows owners, affected profile, and backup impact", async () => {
    const html = await render({
      kind: "duplicateVpkOwnership",
      message: "Duplicate ownership",
      ownership: {
        mods: [
          { id: "1", name: "Jacket" },
          { id: "2", name: "Baggy Billy" },
        ],
        path: "addons/pak19_dir.vpk",
        profileName: "Other profile",
      },
    });
    for (const text of [
      "Jacket",
      "Baggy Billy",
      "pak19_dir.vpk",
      "Other profile",
      "no mods were updated",
      "Copy details",
      "Technical details",
    ])
      expect(html).toContain(text);
    expect(html).toContain('role="alert"');
  });
  it("shows each failed mod's reason after partial success", async () => {
    const html = await render(undefined, {
      backupName: "backup",
      succeeded: ["1"],
      failed: [["42", "Download unavailable"]],
      installedMods: [],
    });
    for (const text of [
      "1 updated, 1 failed",
      "Billy skin",
      "Download unavailable",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("no mods were updated");
  });
  it("keeps unrecognized errors without claiming nothing changed", async () => {
    const html = await render({ message: "Disk full after installation" });
    expect(html).toContain("Disk full after installation");
    expect(html).not.toContain("no mods were updated");
  });
});
