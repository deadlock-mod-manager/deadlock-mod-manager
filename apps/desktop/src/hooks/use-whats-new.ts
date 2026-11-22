import { useEffect } from "react";
import useAbout from "@/hooks/use-about";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { getReleaseVersion } from "@/lib/whats-new-versions";

const LAST_SEEN_VERSION_KEY = "lastSeenVersion";

export const getLastSeenVersion = () =>
  localStorage.getItem(LAST_SEEN_VERSION_KEY);

export const useWhatsNew = () => {
  const { data } = useAbout();

  const showWhatsNew = usePersistedStore((state) => state.showWhatsNew);
  const forceShowWhatsNew = usePersistedStore(
    (state) => state.forceShowWhatsNew,
  );
  const setShowWhatsNew = usePersistedStore((state) => state.setShowWhatsNew);
  const storeMarkVersionAsSeen = usePersistedStore(
    (state) => state.markVersionAsSeen,
  );

  useEffect(() => {
    if (!data?.version) {
      logger.warn("No version data found");
      return;
    }

    const currentVersion = data.version;
    const lastSeenVersion = localStorage.getItem(LAST_SEEN_VERSION_KEY);

    // Show "What's New" if:
    // 1. No version has been seen before (first time user)
    // 2. Current release is different from the last seen release
    if (
      !lastSeenVersion ||
      getReleaseVersion(lastSeenVersion) !== getReleaseVersion(currentVersion)
    ) {
      setShowWhatsNew(true);
    }
  }, [data?.version, setShowWhatsNew]);

  const markVersionAsSeen = () => {
    if (data?.version) {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, data.version);
      storeMarkVersionAsSeen(data.version);
    }
  };

  const forceShow = () => {
    forceShowWhatsNew();
  };

  const reset = () => {
    localStorage.removeItem(LAST_SEEN_VERSION_KEY);
    usePersistedStore.setState({ lastSeenVersion: null, showWhatsNew: true });
  };

  return {
    showWhatsNew,
    markVersionAsSeen,
    forceShow,
    reset,
    currentVersion: data?.version,
  };
};
