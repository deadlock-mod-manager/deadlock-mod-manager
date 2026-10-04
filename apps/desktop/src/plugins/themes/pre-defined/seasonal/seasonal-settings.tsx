import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import {
  useActiveTheme,
  useSeason,
  useSeasonalControls,
} from "@/hooks/use-active-theme";
import {
  nextSeasonalWindow,
  type SeasonalThemeId,
} from "@/lib/seasonal-themes";
import type { ThemeSettings } from "../../custom/types";
import { SEASONS } from "./seasons";

type SeasonalSettingsCardProps = {
  settings: ThemeSettings;
  onChange: (patch: Partial<ThemeSettings>) => void;
};

/** Lets players opt out of seasonal themes; only visible while the server enables them. */
export const SeasonalSettingsCard = ({
  settings,
  onChange,
}: SeasonalSettingsCardProps) => {
  const { t, i18n } = useTranslation();
  const controls = useSeasonalControls();
  const season = useSeason();
  const activeTheme = useActiveTheme();

  if (!controls.enabled) return null;

  const name = (id: SeasonalThemeId) =>
    t(`plugins.seasonal.${SEASONS[id].i18nKey}.name`);
  const formatDate = (date: Date) =>
    date.toLocaleDateString(i18n.language, { day: "numeric", month: "long" });

  const autoEnabled = settings.seasonalThemes !== false;
  const showing = season !== undefined && activeTheme === season.themeId;
  const paused =
    season !== undefined && settings.seasonalDismissed === season.key;
  const next =
    !season && controls.schedule
      ? nextSeasonalWindow(new Date(), (id) => !controls.disabled.includes(id))
      : undefined;

  let status: string | undefined;
  if (showing && season) {
    status = season.end
      ? t("plugins.seasonal.settings.activeUntil", {
          name: name(season.themeId),
          date: formatDate(season.end),
        })
      : t("plugins.seasonal.settings.active", { name: name(season.themeId) });
  } else if (season && paused) {
    status = t("plugins.seasonal.settings.paused", {
      name: name(season.themeId),
    });
  } else if (season && autoEnabled) {
    status = t("plugins.seasonal.settings.blocked", {
      name: name(season.themeId),
    });
  } else if (next) {
    status = t("plugins.seasonal.settings.next", {
      name: name(next.themeId),
      date: formatDate(next.start),
    });
  }

  return (
    <Card className='border-border'>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-4'>
          <CardTitle className='text-lg'>
            {t("plugins.seasonal.settings.title")}
          </CardTitle>
          <div className='flex items-center gap-2'>
            <Switch
              id='seasonal-themes-auto'
              checked={autoEnabled}
              onCheckedChange={(checked) =>
                onChange({ seasonalThemes: checked })
              }
            />
            <label
              htmlFor='seasonal-themes-auto'
              className='text-sm font-medium cursor-pointer'>
              {t("plugins.seasonal.settings.automatic")}
            </label>
          </div>
        </div>
        <CardDescription>
          {t("plugins.seasonal.settings.description")}
        </CardDescription>
      </CardHeader>
      {status || showing || paused ? (
        <CardContent className='flex flex-wrap items-center justify-between gap-3'>
          {status ? (
            <p className='text-sm text-muted-foreground'>{status}</p>
          ) : null}
          {showing && season ? (
            <Button
              size='sm'
              variant='outline'
              type='button'
              onClick={() => onChange({ seasonalDismissed: season.key })}>
              {t("plugins.seasonal.settings.dismiss")}
            </Button>
          ) : paused ? (
            <Button
              size='sm'
              variant='outline'
              type='button'
              onClick={() => onChange({ seasonalDismissed: undefined })}>
              {t("plugins.seasonal.settings.restore")}
            </Button>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
};
