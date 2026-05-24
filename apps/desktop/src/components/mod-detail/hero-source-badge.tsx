import { useTranslation } from "react-i18next";
import type { ResolvedHeroSource } from "@/lib/mods/hero-resolution";

interface HeroSourceBadgeProps {
  source: ResolvedHeroSource;
}

export const HeroSourceBadge = ({ source }: HeroSourceBadgeProps) => {
  const { t } = useTranslation();

  const labelBySource: Record<ResolvedHeroSource, string> = {
    api: t("modDetail.heroSource.api", { defaultValue: "API" }),
    manual: t("modDetail.heroSource.manual", { defaultValue: "Manual" }),
    name: t("modDetail.heroSource.name", { defaultValue: "Name" }),
    none: t("modDetail.heroSource.none", { defaultValue: "Unset" }),
    vpk: t("modDetail.heroSource.vpk", { defaultValue: "VPK" }),
  };

  return (
    <span className='shrink-0 rounded border border-border/60 px-1.5 py-0.5 text-[10px] leading-none normal-case'>
      {labelBySource[source]}
    </span>
  );
};
