import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { GithubLogoIcon, PackageIcon } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  type PresetListItem,
  unusedCount,
} from "@/lib/performance/config-list";
import { usePerformanceUi } from "../performance-context";
import { ApplyConfigButton } from "./apply-config-button";
import {
  CardFooter,
  Chip,
  ConfigCardShell,
  TierLabel,
  TierMeter,
} from "./card-parts";

export const PresetCard = ({
  item,
  active,
}: {
  item: PresetListItem;
  active: boolean;
}) => {
  const { t } = useTranslation();
  const { openDetails } = usePerformanceUi();
  const { preset } = item;
  const unused = unusedCount(preset.counts);
  const sourceName =
    preset.source.kind === "github"
      ? t("performance.configs.sources.github")
      : t("performance.configs.sources.bundled");

  return (
    <ConfigCardShell active={active}>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <TierLabel tier={preset.tier} />
          {preset.recommended && (
            <Badge className='px-1.5 py-0 text-[11px]' variant='secondary'>
              {t("performance.configs.recommended")}
            </Badge>
          )}
        </div>
        <TierMeter tier={preset.tier} />
      </div>
      <div className='min-w-0'>
        <h3 className='truncate font-semibold text-base' title={preset.name}>
          {preset.name}
        </h3>
        <p className='truncate text-muted-foreground text-xs'>
          {t("performance.configs.by", { author: preset.author })}
        </p>
      </div>
      <p className='line-clamp-2 text-muted-foreground text-sm'>
        {preset.blurb}
      </p>
      <div className='flex flex-wrap gap-1.5'>
        <Chip>
          {t("performance.configs.settingsCount", {
            count: preset.counts.applies,
          })}
        </Chip>
        {unused > 0 && (
          <Chip title={t("performance.configs.unusedHint")} tone='warning'>
            {t("performance.configs.unusedCount", { count: unused })}
          </Chip>
        )}
        {preset.highlights.map((highlight) => (
          <Chip key={highlight}>{highlight}</Chip>
        ))}
      </div>
      <CardFooter
        source={
          <>
            {preset.source.kind === "github" ? (
              <GithubLogoIcon aria-hidden />
            ) : (
              <PackageIcon aria-hidden />
            )}
            {preset.updatedAt
              ? t("performance.configs.sourceWithTime", {
                  source: sourceName,
                  time: formatDistanceToNow(new Date(preset.updatedAt), {
                    addSuffix: true,
                  }),
                })
              : sourceName}
          </>
        }>
        <Button
          onClick={() => openDetails(item.configId)}
          size='sm'
          variant='ghost'>
          {t("performance.configs.details")}
        </Button>
        <ApplyConfigButton
          config={{ kind: "preset", preset }}
          entryPoint='card'
        />
      </CardFooter>
    </ConfigCardShell>
  );
};
