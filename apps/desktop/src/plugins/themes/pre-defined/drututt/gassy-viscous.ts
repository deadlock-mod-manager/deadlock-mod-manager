import { useEffect } from "react";
import { useLocation } from "react-router";
import { getPluginAssetUrl } from "@/lib/plugins";
import { usePersistedStore } from "@/lib/store";

// Easter egg: "Incredible Gassy Viscous" on GameBanana.
const GASSY_VISCOUS_PATH = "/mods/653571";

const fartUrl = getPluginAssetUrl(
  "themes",
  "public/pre-defined/drututt/gassy-viscous.mp3",
);

export const useGassyViscousFart = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname !== GASSY_VISCOUS_PATH) return;
    const volume = usePersistedStore.getState().audioVolume / 100;
    if (volume === 0) return;

    const audio = new Audio(fartUrl);
    audio.volume = volume;
    void audio.play();
    return () => {
      audio.pause();
    };
  }, [pathname]);
};
