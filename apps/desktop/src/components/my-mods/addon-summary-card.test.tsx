import { describe, expect, it, mock } from "bun:test";
import { createInstance } from "i18next";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";
import type { LocalAddonInfo } from "@/types/mods";

type LibraryCheck = { owned: boolean | undefined; isLoading: boolean };
let libraryCheck: LibraryCheck = { owned: undefined, isLoading: false };
let lookedUp: string | undefined;
let libraryModIds: string[] = [];

mock.module("@/hooks/use-vpk-scan", () => ({
  useVpkScan: () => ({
    isLibraryVpk: (locator: string) => {
      lookedUp = locator;
      return libraryCheck.owned;
    },
    isLoading: libraryCheck.isLoading,
  }),
}));
mock.module("@/lib/store", () => ({
  usePersistedStore: <T,>(
    selector: (state: { localMods: { remoteId: string }[] }) => T,
  ) => selector({ localMods: libraryModIds.map((remoteId) => ({ remoteId })) }),
}));
let openedUrls: string[] = [];
let clickLink: (() => void) | undefined;
mock.module("@tauri-apps/plugin-opener", () => ({
  openUrl: async (url: string) => {
    openedUrls.push(url);
  },
}));
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
  ExternalLink: ({ onClick }: { onClick?: () => void }) => {
    clickLink = onClick;
    return <svg data-icon='external-link' />;
  },
  Plus: () => <svg />,
  XCircle: () => <svg />,
}));

const { AddonSummaryCard } = await import("./addon-summary-card");

const i18n = createInstance();
await i18n.init({
  lng: "en",
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});
const renderCard = (card: LocalAddonInfo) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <AddonSummaryCard addon={card} />
    </I18nextProvider>,
  );

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
  return renderCard(addon);
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

describe("AddonSummaryCard identified addon", () => {
  const identified: LocalAddonInfo = { ...addon, remoteId: "900001" };
  const renderIdentified = (inLibrary: string[], owned?: boolean) => {
    libraryModIds = inLibrary;
    libraryCheck = { owned, isLoading: false };
    return renderCard(identified);
  };

  it("doesn't claim a mod the library lacks was added", () => {
    const html = renderIdentified([]);
    expect(html).not.toContain("Added to Library");
    expect(html).toContain("Not in Library");
    expect(html).not.toContain("<button");
  });

  it("shows a mod the library has as added", () => {
    const html = renderIdentified(["900001"]);
    expect(html).toContain("Added to Library");
    expect(html).not.toContain("Not in Library");
  });

  it("goes by the library, not by who owns the file", () => {
    // A parked, prefix-named file belongs to its library mod without being
    // one of its installed files.
    expect(renderIdentified(["900001"], false)).toContain("Added to Library");
    expect(renderIdentified(["other"], true)).toContain("Not in Library");
  });
});

describe("AddonSummaryCard GameBanana link", () => {
  const renderIdentified = (identity: Partial<LocalAddonInfo>) => {
    libraryCheck = { owned: true, isLoading: false };
    clickLink = undefined;
    openedUrls = [];
    return renderCard({ ...addon, ...identity });
  };
  const LOCAL_ID = "local-550e8400-e29b-41d4-a716-446655440000";

  // Analyze names a local mod from the profile's records when no hash matches.
  it("offers no GameBanana link for a local mod", () => {
    expect(
      renderIdentified({ remoteId: LOCAL_ID, manifestModId: LOCAL_ID }),
    ).not.toContain("external-link");
  });

  it("opens a catalog mod's GameBanana page", () => {
    expect(renderIdentified({ remoteId: "snd-123456" })).toContain(
      "external-link",
    );
    clickLink?.();
    expect(openedUrls).toEqual(["https://gamebanana.com/sounds/123456"]);
  });
});
