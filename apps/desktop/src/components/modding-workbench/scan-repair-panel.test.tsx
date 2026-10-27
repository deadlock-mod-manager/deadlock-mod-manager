import { describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import type { ButtonHTMLAttributes, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";
import type { ModdingRepairIssue } from "@/types/generated/ModdingRepairIssue";

mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));
mock.module("@deadlock-mods/ui/components/checkbox", () => ({
  Checkbox: ({
    checked,
    disabled,
    "aria-label": label,
  }: {
    checked: boolean | "indeterminate";
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <button
      role='checkbox'
      aria-label={label}
      aria-checked={checked === "indeterminate" ? "mixed" : checked}
      disabled={disabled}
    />
  ),
}));

const { RepairBackups } = await import("./repair-backups");
const { RepairIssueRow } = await import("./repair-issue-row");
const { ScanRepairPanel } = await import("./scan-repair-panel");

async function render(element: ReactElement) {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={i18n}>{element}</I18nextProvider>
    </QueryClientProvider>,
  );
}

const stock: ModdingRepairIssue = {
  id: "stock-skeleton",
  kind: "stockDependency",
  file: "models/hero/clip.vnmclip",
  property: "m_animationSkeletonName",
  current: "models/hero/rig.vnmskel",
  proposed: "models/hero/rig.vnmskel_c",
  targets: ["models/hero/rig.vnmskel", "models/hero/rig.dmx"],
  detail: "Exact stock source",
  repairable: true,
};

describe("Scan & Repair", () => {
  it("shows every stock sidecar and preserves the distinction from custom files", async () => {
    const html = await render(
      <RepairIssueRow
        issue={stock}
        selected={false}
        disabled={false}
        onSelect={() => {}}
      />,
    );
    expect(html).toContain("models/hero/rig.vnmskel");
    expect(html).toContain("models/hero/rig.dmx");
    expect(html).toContain("2 missing stock files will be added");
    expect(html).toContain("preserve existing custom files");
    expect(html).toContain('role="checkbox"');
  });

  it("offers no repair checkbox for missing artwork", async () => {
    const issue: ModdingRepairIssue = {
      ...stock,
      kind: "emptyTemplate",
      repairable: false,
      proposed: null,
      targets: [],
    };
    const html = await render(
      <RepairIssueRow
        issue={issue}
        selected={false}
        disabled={false}
        onSelect={() => {}}
      />,
    );
    expect(html).toContain("cannot restore missing artwork");
    expect(html).not.toContain('role="checkbox"');
  });

  it("keeps restored backups visible and disables a second restore", async () => {
    const html = await render(
      <RepairBackups
        backups={[
          {
            id: "repair-previous",
            createdAt: "2026-10-27T12:00:00Z",
            files: stock.targets,
            restored: true,
          },
        ]}
        disabled={false}
        restoring={undefined}
        onRestore={() => {}}
      />,
    );
    expect(html).toContain("repair-previous");
    expect(html).toContain("models/hero/rig.dmx");
    expect(html).toContain("Newer edits block restoration");
    expect(html).toContain("Compiled outputs are not restored");
    expect(html).toContain("Restored");
    expect(html).toContain("disabled");
  });

  it("starts with a read-only scan and explains the limits before applying", async () => {
    const html = await render(
      <ScanRepairPanel
        addon={{
          id: "addon",
          name: "Hero addon",
          sdkRoot: "sdk",
          contentPath: "content",
          gamePath: "game",
          archivePath: "game.vpk",
        }}
        onChanged={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("Scan addon");
    expect(html).toContain("without modifying it");
    expect(html).toContain(
      "Compilation compatibility and visual fidelity are separate results",
    );
    expect(html).toContain("Apply 0 selected repairs");
    expect(html).toContain(".dmm-history");
  });
});
