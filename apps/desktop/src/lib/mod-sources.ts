import { ProviderError } from "@deadlock-mods/common/client-errors";
import type { ModDto } from "@deadlock-mods/shared";
import { CONTENT_TYPES } from "@deadlock-mods/shared";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { NativeSourceListing } from "@/types/generated/NativeSourceListing";
import type { NativeSourceMod } from "@/types/generated/NativeSourceMod";
import type { NativeSourceProvenance } from "@/types/generated/NativeSourceProvenance";
import type { NativeSourceRelease } from "@/types/generated/NativeSourceRelease";
import type { NativeSourceSummary } from "@/types/generated/NativeSourceSummary";
import type { ModDownloadItem } from "@/types/mods";
import { getErrorMessage } from "@/lib/errors";
import type { ContentType } from "@/lib/store/slices/ui";

export const NATIVE_SOURCES_QUERY_KEY = ["native-mod-sources"];
export const MOD_SOURCE_AUTHOR_GUIDE =
  "https://docs.deadlockmods.app/developer-docs/mod-sources";

export const isNativeSourceMod = (remoteId: string) =>
  /^source-[a-f0-9]{64}$/.test(remoteId);

export const isNativeSourceImage = (url: string) =>
  /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(url);

export const nativeListingVisible = (
  listing: NativeSourceListing,
  hideAdult: boolean,
) => !hideAdult || listing.isNsfw === false;

// Published categories share the desktop's broader browsing tabs.
const CONTENT_TYPE_TABS = {
  skins: "mod",
  gameplay: "mod",
  hud: "mod",
  models: "mod",
  music: "sound",
  maps: "map",
  "ability-sounds": "sound",
  "weapon-sounds": "sound",
  "voice-lines": "sound",
  "kill-sounds": "sound",
  "killstreak-music": "sound",
  other: "mod",
} satisfies Record<(typeof CONTENT_TYPES)[number]["id"], ContentType>;

const nativeContentType = (contentType: string | null) => {
  const category = CONTENT_TYPES.find(({ id }) => id === contentType);
  return category ? CONTENT_TYPE_TABS[category.id] : (contentType ?? "mod");
};

export const nativeListingMatchesContentType = (
  listing: NativeSourceListing,
  contentType: ContentType,
) => nativeContentType(listing.contentType) === contentType;

const invokeNative = async <T>(
  command: string,
  args?: Record<string, string | boolean>,
): Promise<T> => {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new ProviderError(getErrorMessage(error), error);
  }
};

export const listNativeSources = () =>
  invokeNative<NativeSourceSummary[]>("list_native_sources");
export const previewNativeSource = (descriptorUrl: string) =>
  invokeNative<NativeSourceSummary>("preview_native_source", { descriptorUrl });
export const addNativeSource = ({
  descriptorUrl,
  previewToken,
}: {
  descriptorUrl: string;
  previewToken: string;
}) =>
  invokeNative<NativeSourceSummary>("add_native_source", {
    descriptorUrl,
    previewToken,
  });
export const setNativeSourceEnabled = (sourceKey: string, enabled: boolean) =>
  invokeNative<NativeSourceSummary>("set_native_source_enabled", {
    sourceKey,
    enabled,
  });
export const removeNativeSource = (sourceKey: string) =>
  invokeNative<void>("remove_native_source", { sourceKey });
export const refreshNativeSource = (sourceKey: string) =>
  invokeNative<NativeSourceSummary>("refresh_native_source", { sourceKey });
export const queryNativeSource = (sourceKey: string, query = "") =>
  invokeNative<NativeSourceListing[]>("query_native_source", {
    sourceKey,
    query,
  });

export const useNativeSources = () =>
  useQuery({
    queryKey: NATIVE_SOURCES_QUERY_KEY,
    queryFn: listNativeSources,
    staleTime: 30_000,
  });

export const getNativeSourceRecord = (remoteId: string) =>
  invokeNative<NativeSourceMod>("get_native_source_mod", { remoteId });

export const useNativeSourceContext = (remoteId: string) =>
  useQuery({
    queryKey: [...NATIVE_SOURCES_QUERY_KEY, "detail", remoteId],
    queryFn: () => getNativeSourceRecord(remoteId),
    enabled: isNativeSourceMod(remoteId),
    staleTime: 30_000,
    meta: { skipGlobalErrorHandler: true },
  });

export const useNativeSourceReleaseHistory = (remoteId: string) =>
  useQuery({
    queryKey: [...NATIVE_SOURCES_QUERY_KEY, "release-history", remoteId],
    queryFn: () =>
      invokeNative<NativeSourceRelease[]>("get_native_source_release_history", {
        remoteId,
      }),
    enabled: isNativeSourceMod(remoteId),
    staleTime: 5 * 60_000,
    meta: { skipGlobalErrorHandler: true },
  });

export const nativeSourceProvenance = (
  source: NativeSourceSummary,
  listing: NativeSourceListing,
): NativeSourceProvenance => ({
  sourceKey: source.key,
  sourceId: source.descriptor.sourceId,
  sourceName: source.descriptor.name,
  acceptedOrigin: source.acceptedOrigin,
  descriptorUrl: source.descriptorUrl,
  listingId: listing.id,
  releaseId: listing.release?.id ?? "",
  contentRevision: listing.release?.contentRevision ?? "",
  artifactIds: listing.release?.artifacts.map((artifact) => artifact.id) ?? [],
  componentIds: [],
  iconUrl: source.descriptor.iconUrl ?? null,
});

export const toNativeModDto = (
  source: NativeSourceSummary,
  listing: NativeSourceListing,
  remoteId = listing.remoteId,
): ModDto & { source: NativeSourceProvenance } => {
  const updatedAt = listing.updatedAt
    ? new Date(listing.updatedAt)
    : new Date(0);
  return {
    id: remoteId,
    remoteId,
    name: listing.title,
    description: listing.description ?? null,
    remoteUrl: listing.homepageUrl ?? "",
    category: "",
    likes: 0,
    author: listing.author ?? source.descriptor.name,
    modAuthorId: null,
    downloadable:
      source.enabled &&
      !source.removed &&
      listing.availability === "available" &&
      !!listing.release?.artifacts.length,
    remoteAddedAt: updatedAt,
    remoteUpdatedAt: updatedAt,
    tags: listing.tags,
    images: listing.images.filter(isNativeSourceImage),
    hero: listing.hero ?? null,
    isAudio: nativeContentType(listing.contentType) === "sound",
    isMap: nativeContentType(listing.contentType) === "map",
    audioUrl: null,
    downloadCount: 0,
    isNSFW: listing.isNsfw === true,
    isObsolete: null,
    isBlacklisted: false,
    blacklistReason: null,
    blacklistedAt: null,
    blacklistedBy: null,
    overrides: null,
    filesUpdatedAt: null,
    metadata: null,
    dependencies: null,
    createdAt: null,
    updatedAt: null,
    source: nativeSourceProvenance(source, listing),
  };
};

export const nativeModDownloads = (
  source: NativeSourceSummary,
  listing: NativeSourceListing,
): ModDownloadItem[] => {
  const release = listing.release;
  if (
    !release ||
    !source.enabled ||
    source.removed ||
    listing.availability !== "available"
  )
    return [];
  return release.artifacts.map((artifact) => ({
    url: `dmm-source-file://${source.key}/${[listing.id, release.id, release.contentRevision, artifact.id].map(encodeURIComponent).join("/")}`,
    size: artifact.size ?? 0,
    name: artifact.filename,
    description: null,
    createdAt: null,
    updatedAt: null,
    md5Checksum: artifact.hashes?.md5 ?? null,
  }));
};

export const getNativeSourceMod = async (remoteId: string) => {
  const record = await getNativeSourceRecord(remoteId);
  const mod = toNativeModDto(record.source, record.listing, remoteId);
  return {
    mod,
    source: mod.source,
    downloads: nativeModDownloads(record.source, record.listing),
  };
};
