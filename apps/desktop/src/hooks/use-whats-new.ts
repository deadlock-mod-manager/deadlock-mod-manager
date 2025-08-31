import { useEffect, useState } from 'react';
import useAbout from '@/hooks/use-about';

const LAST_SEEN_VERSION_KEY = 'lastSeenVersion';

const useWhatsNew = () => {
  const { data } = useAbout();
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  useEffect(() => {
    if (!data?.version) {
      return;
    }

    const currentVersion = data.version;
    const lastSeenVersion = localStorage.getItem(LAST_SEEN_VERSION_KEY);

    // Show "What's New" if:
    // 1. No version has been seen before (first time user)
    // 2. Current version is different from last seen version
    if (!lastSeenVersion || lastSeenVersion !== currentVersion) {
      setShowWhatsNew(true);
    }
  }, [data?.version]);

  const markVersionAsSeen = () => {
    if (data?.version) {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, data.version);
    }
    setShowWhatsNew(false);
  };

  const forceShow = () => {
    setShowWhatsNew(true);
  };

  return {
    showWhatsNew,
    markVersionAsSeen,
    forceShow,
    currentVersion: data?.version,
  };
};

export default useWhatsNew;
