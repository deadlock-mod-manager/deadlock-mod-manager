import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getPluginAssetUrl } from "@/lib/plugins";

const drututModsUrl = getPluginAssetUrl(
  "themes",
  "public/pre-defined/drututt/mods.png",
);

const TRIGGER = "mods";
const VISIBLE_MS = 2000;

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

// Easter egg: typing "mods" outside a text field summons drututMODS, the channel's chat call for moderators.
export const ModsPopup = () => {
  const { t } = useTranslation();
  const [shownAt, setShownAt] = useState<number | null>(null);

  useEffect(() => {
    let typed = "";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.key.length !== 1) return;
      typed = (typed + event.key.toLowerCase()).slice(-TRIGGER.length);
      if (typed === TRIGGER) {
        typed = "";
        setShownAt(Date.now());
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (shownAt === null) return;
    const timer = setTimeout(() => setShownAt(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [shownAt]);

  if (shownAt === null) return null;

  return createPortal(
    <img
      alt={t("accessibility.drututModsAlt")}
      className='pointer-events-none fixed right-8 bottom-12 z-50 size-28 animate-in motion-safe:zoom-in-50 motion-safe:fade-in motion-safe:duration-300'
      key={shownAt}
      src={drututModsUrl}
    />,
    document.body,
  );
};
