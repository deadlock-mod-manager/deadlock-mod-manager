import { describe, expect, it, mock } from "bun:test";
import { createInstance } from "i18next";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";
import type { ImportFailure, ProfileImportOutcome } from "@/lib/profiles/types";
import { createProfileId } from "@/types/profiles";

const Plain = ({ children }: { children: ReactNode }) => <div>{children}</div>;
mock.module("@deadlock-mods/ui/components/dialog", () => ({
  DialogDescription: Plain,
  DialogFooter: Plain,
  DialogHeader: Plain,
  DialogTitle: Plain,
}));
mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: ({
    children,
  }: Pick<ButtonHTMLAttributes<HTMLButtonElement>, "children">) => (
    <button>{children}</button>
  ),
}));

const { ImportResultView } = await import("./import-result-view");

const render = async (outcome: ProfileImportOutcome) => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <ImportResultView outcome={outcome} onDone={() => {}} />
    </I18nextProvider>,
  );
};

describe("ImportResultView", () => {
  it("lists every mod that wasn't imported with its reason", async () => {
    const ids = ["2", "3", "4", "5", "6", "7"];
    const installFailures: ImportFailure[] = ids.map((remoteId) => ({
      remoteId,
      name: `Skin ${remoteId}`,
      step: "install",
      error: "ModFileNotFound",
    }));
    const html = await render({
      profileId: createProfileId("friends"),
      profileName: "Friends",
      importedCount: 1,
      totalCount: 9,
      failures: [
        { remoteId: "920099", name: null, step: "lookup", error: null },
        { remoteId: "8", name: "Charlie", step: "downloads", error: "x" },
        ...installFailures,
      ],
    });

    expect(html).toContain("Import finished");
    expect(html).toContain("1 of 9 mods imported into &#x27;Friends&#x27;");
    expect(html).toContain("Not imported (8)");
    expect(html).toContain("Mod 920099");
    expect(html).toContain("Could not get the mod&#x27;s details");
    expect(html).toContain("Charlie");
    expect(html).toContain("Could not get its downloads");
    for (const id of ids) expect(html).toContain(`Skin ${id}`);
    expect(html.match(/Download or install failed/g)).toHaveLength(6);
    expect(html).toContain("Done");
  });
});
