import type { ModDto } from "@deadlock-mods/shared";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import liveBridgeLogo from "@/assets/live-bridge.svg";
import ModCard from "@/components/mod-browsing/mod-card";
import {
  LIVE_BRIDGE_AUTHOR,
  LIVE_BRIDGE_NAME,
  useLiveBridge,
} from "@/hooks/use-live-bridge";
import { isLiveBridge } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";

/** Built from the installed game, so it has no remote catalog listing. */
export const LiveBridgeCard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { install } = useLiveBridge();
  const remoteId = usePersistedStore(
    (state) => state.localMods.find(isLiveBridge)?.remoteId ?? "live-bridge",
  );
  const mod: ModDto = {
    id: remoteId,
    remoteId,
    name: LIVE_BRIDGE_NAME,
    description: t("stats.live.bridge.modDescription"),
    remoteUrl: "",
    category: "",
    likes: 0,
    author: LIVE_BRIDGE_AUTHOR,
    modAuthorId: null,
    downloadable: false,
    remoteAddedAt: new Date(0),
    remoteUpdatedAt: new Date(0),
    tags: [],
    images: [liveBridgeLogo],
    hero: null,
    isAudio: false,
    isMap: false,
    audioUrl: null,
    downloadCount: 0,
    isNSFW: false,
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
  };

  return (
    <ModCard
      builtIn={{
        onAdd: () => install.mutateAsync(),
        onOpen: () => navigate("/stats?tab=live"),
      }}
      mod={mod}
    />
  );
};
