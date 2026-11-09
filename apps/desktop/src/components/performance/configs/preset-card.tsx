import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  GithubLogoIcon,
  PackageIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
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
  CardHeader,
  ConfigCardShell,
  MetaItem,
  MetaRow,
  TierLabel,
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
    <ConfigCardShell active={active} configId={item.configId}>
      <CardHeader
        label={
          <>
            <TierLabel tier={preset.tier} />
            {preset.recommended && (
              <Badge className='px-1.5 py-0 text-[11px]' variant='secondary'>
                {t("performance.configs.recommended")}
              </Badge>
            )}
          </>
        }
        provenance={
          <>
            {preset.source.kind === "github" ? (
              <GithubLogoIcon aria-hidden />
            ) : (
              <PackageIcon aria-hidden />
            )}
            {preset.updatedAt ? (
              <>
                <span className='sr-only'>{sourceName}</span>
                {formatDistanceToNow(new Date(preset.updatedAt), {
                  addSuffix: true,
                })}
              </>
            ) : (
              sourceName
            )}
          </>
        }
      />
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
      <MetaRow>
        <MetaItem
          icon={<SlidersHorizontalIcon aria-hidden />}
          tooltip={
            unused > 0
              ? t("performance.configs.unusedHint", { count: unused })
              : undefined
          }>
          {t("performance.configs.settingsCount", {
            count: preset.counts.applies,
          })}
        </MetaItem>
      </MetaRow>
      <CardFooter>
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
