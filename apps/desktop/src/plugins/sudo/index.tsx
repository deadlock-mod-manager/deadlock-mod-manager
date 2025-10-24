import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import type { PluginModule } from "@/plugins/types";

export const manifest = {
  id: "sudo",
  nameKey: "plugins.sudo.title",
  descriptionKey: "plugins.sudo.description",
  version: "0.0.1",
  author: "Skeptic",
  icon: "public/icon.svg",
} as const;

const Render = () => {
  const isEnabled = usePersistedStore(
    (s) => s.enabledPlugins[manifest.id] ?? false,
  );

  // No DOM changes required other than feature enablement; placeholder for future
  useEffect(() => {
    return () => {};
  }, []);

  return null;
};

const Settings = () => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-2'>
      <p className='text-sm text-muted-foreground'>
        {t("plugins.sudo.usageInstructions")}
      </p>
    </div>
  );
};

const mod: PluginModule = {
  manifest,
  Render,
  Settings,
  // No dedicated Page here; overview stays on plugin page
};

export default mod;
