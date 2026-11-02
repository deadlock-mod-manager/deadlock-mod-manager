import { describe, expect, it, mock } from "bun:test";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocalAddonInfo } from "@/types/mods";

type LibraryCheck = { owned: boolean | undefined; isLoading: boolean };
let libraryCheck: LibraryCheck = { owned: undefined, isLoading: false };
let lookedUp: string | undefined;

mock.module("@/hooks/use-vpk-scan", () => ({
  useVpkScan: () => ({
    isLibraryVpk: (locator: string) => {
      lookedUp = locator;
      return libraryCheck.owned;
    },
    isLoading: libraryCheck.isLoading,
  }),
}));
mock.module("@tauri-apps/plugin-opener", () => ({ openUrl: async () => {} }));
mock.module("./addon-info", () => ({ AddonInfo: () => null }));
mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: ({
    children,
    disabled,
  }: Pick<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "disabled"
  >) => <button disabled={disabled}>{children}</button>,
}));
mock.module("@deadlock-mods/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
mock.module("@deadlock-mods/ui/icons", () => ({
  ExternalLink: () => <svg />,
  Plus: () => <svg />,
  XCircle: () => <svg />,
}));

const { AddonSummaryCard } = await import("./addon-summary-card");

const addon: LocalAddonInfo = {
  filePath: "/game/citadel/addons2/pak01_dir.vpk",
  fileName: "pak01_dir.vpk",
  // An overflow shard, so the locator differs from the file name.
  locator: "addons2/pak01_dir.vpk",
  vpkParsed: {
    version: 2,
    treeLength: 0,
    fileDataSectionSize: null,
    archiveMd5SectionSize: null,
    otherMd5SectionSize: null,
    signatureSectionSize: null,
    entries: [],
    manifestSha256: "manifest",
    dirSha256: null,
    fingerprint: {
      filePath: "/game/citadel/addons2/pak01_dir.vpk",
      fileSize: 1,
      lastModified: null,
      fastHash: "fast",
      sha256: "sha",
      contentSignature: "signature",
      vpkVersion: 2,
      fileCount: 0,
      hasMultiparts: false,
      hasInlineData: false,
      merkleRoot: null,
      merkleLeaves: null,
    },
  },
};

const render = (check: LibraryCheck) => {
  libraryCheck = check;
  lookedUp = undefined;
  return renderToStaticMarkup(<AddonSummaryCard addon={addon} />);
};

describe("AddonSummaryCard library check", () => {
  it("disables Add while the library check is loading", () => {
    expect(render({ owned: undefined, isLoading: true })).toContain(
      '<button disabled="">',
    );
  });

  it("enables Add for a file no library mod owns", () => {
    const html = render({ owned: false, isLoading: false });
    expect(html).toContain("Add to Library");
    expect(html).not.toContain("disabled");
  });

  it("shows a file a library mod owns as added", () => {
    const html = render({ owned: true, isLoading: false });
    expect(lookedUp).toBe("addons2/pak01_dir.vpk");
    expect(html).toContain("Added to Library");
    expect(html).not.toContain("<button");
  });

  it("keeps Add available when the check could not run", () => {
    const html = render({ owned: undefined, isLoading: false });
    expect(html).toContain("Add to Library");
    expect(html).not.toContain("disabled");
  });
});
