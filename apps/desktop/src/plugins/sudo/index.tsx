import { useTranslation } from "react-i18next";
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
