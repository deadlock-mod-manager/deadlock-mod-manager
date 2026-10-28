import { TriangleAlert } from "@deadlock-mods/ui/icons";
import { Trans, useTranslation } from "react-i18next";
import { GITHUB_REPO } from "@/lib/constants";

export const UnofficialSitesWarning = () => {
  const { t } = useTranslation("download");

  return (
    <div className='flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm'>
      <TriangleAlert className='mt-0.5 h-4 w-4 shrink-0 text-amber-500' />
      <div className='space-y-1'>
        <p className='font-semibold'>{t("unofficialSites.title")}</p>
        <p className='text-muted-foreground'>
          <Trans
            components={{
              code: <code className='font-mono text-foreground' />,
              github: (
                <a
                  className='text-primary hover:underline'
                  href={`${GITHUB_REPO}/releases`}
                  rel='noopener noreferrer'
                  target='_blank'
                />
              ),
            }}
            i18nKey='unofficialSites.description'
            t={t}
          />
        </p>
      </div>
    </div>
  );
};
