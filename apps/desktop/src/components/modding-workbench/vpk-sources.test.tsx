import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import type { ButtonProps } from "@deadlock-mods/ui/components/button";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import en from "@/locales/en.json";

const mod = {
  id: "catalog-skin-id",
  remoteId: "downloaded-skin",
  name: "Downloaded skin",
  status: "downloaded",
};
interface MockLibraryState {
  localMods: (typeof mod)[];
  profiles: { default: { folderName: string | null } };
  activeProfileId: "default";
}
const mockState: MockLibraryState = {
  localMods: [mod],
  profiles: { default: { folderName: null } },
  activeProfileId: "default",
};
mock.module("@/lib/store", () => ({
  usePersistedStore: <T,>(select: (state: typeof mockState) => T) =>
    select(mockState),
}));
mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: ({ children, isLoading, ...props }: ButtonProps) => (
    <button {...props} disabled={props.disabled || isLoading}>
      {children}
    </button>
  ),
}));
const { VpkSources } = await import("./vpk-sources");

afterEach(() => {
  mockState.profiles.default.folderName = null;
});

test.each([null, "profile_custom"])(
  "library VPKs use the provider ID and selected profile (%s)",
  async (profileFolder) => {
    mockState.profiles.default.folderName = profileFolder;
    const client = new QueryClient();
    client.setQueryData(
      ["workbench-library-vpks", mod.remoteId, profileFolder],
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
          <VpkSources
            disabled={false}
            external={[]}
            opening={false}
            error={null}
            onBrowse={() => {}}
            onOpen={() => {}}
          />
        </I18nextProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain("1 mod");
    expect(html).toContain("Downloaded skin");
    expect(html).toContain('title="/mod-cache/downloaded-skin/files/skin.vpk"');
    expect(html).toContain('draggable="true"');
    expect(html).not.toContain("No VPK files found");
  },
);
