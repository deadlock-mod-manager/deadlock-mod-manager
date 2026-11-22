import { CubeIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { HeaderToggle } from "@/components/skins/header-toggle";
import { usePersistedStore } from "@/lib/store";

/**
 * Shows or hides the 3D panel. It is the Foundry's preview setting, since the
 * panel runs the same decode and render on the same GPU.
 */
export const SkinPreviewSwitch = () => {
  const { t } = useTranslation();
  const enabled = usePersistedStore((state) => state.foundry3dPreviewEnabled);
  const setEnabled = usePersistedStore(
    (state) => state.setFoundry3dPreviewEnabled,
  );

  return (
    <HeaderToggle
      checked={enabled}
      description={t(enabled ? "skins.preview.on" : "skins.preview.off")}
      icon={<CubeIcon weight='duotone' />}
      id='skin-3d-preview'
      onCheckedChange={setEnabled}
      title={t("skins.preview.title")}
      tone='primary'
    />
  );
};
