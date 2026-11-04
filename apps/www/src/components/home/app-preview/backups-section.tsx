import { getLocaleConfig } from "@/lib/i18n/locales";
import { useLocale } from "@/lib/i18n/route";
import { buttonVariants } from "@deadlock-mods/ui/components/button";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { ArchiveIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LocalToggle } from "./local-toggle";
import { usePreviewState } from "./preview-state";
import { Section } from "./section";

export type Backup = {
  id: number;
  createdAt: number;
  vpks: number;
  size: string;
};

export const BackupsSection = () => {
  const { t } = useTranslation("preview");
  const locale = getLocaleConfig(useLocale()).hreflang;
  const { notify, installs } = usePreviewState();
  const [backups, setBackups] = useState<Backup[]>([
    {
      id: 1,
      createdAt: new Date(2026, 8, 28, 21, 14).getTime(),
      vpks: 3,
      size: "412 MB",
    },
  ]);

  const formatBackupDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const createBackup = () => {
    const vpks = Object.values(installs).filter(
      (install) => install.status === "installed",
    ).length;
    setBackups((current) => [
      {
        id: Date.now(),
        createdAt: Date.now(),
        vpks,
        size: `${vpks * 131 + 19} MB`,
      },
      ...current,
    ]);
    notify(
      t("settings.backups.created.title"),
      t("settings.backups.created.description", { total: vpks }),
    );
  };

  return (
    <Section
      title={t("settings.backups.title")}
      description={t("settings.backups.description")}
      action={
        <button
          type='button'
          onClick={createBackup}
          className={buttonVariants()}>
          <ArchiveIcon />
          {t("settings.backups.create")}
        </button>
      }>
      <LocalToggle
        label={t("settings.backups.autoBackup.label")}
        description={t("settings.backups.autoBackup.description")}
        initial
      />
      <table className='w-full text-sm'>
        <thead className='text-left text-muted-foreground text-xs'>
          <tr>
            <th className='pb-2 font-medium'>
              {t("settings.backups.columns.date")}
            </th>
            <th className='pb-2 font-medium'>
              {t("settings.backups.columns.vpkFiles")}
            </th>
            <th className='pb-2 font-medium'>
              {t("settings.backups.columns.size")}
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {backups.map((backup) => {
            const date = formatBackupDate(backup.createdAt);
            return (
              <tr key={backup.id} className='border-border/40 border-t'>
                <td className='py-2'>{date}</td>
                <td className='py-2 tabular-nums'>{backup.vpks}</td>
                <td className='py-2 tabular-nums'>{backup.size}</td>
                <td className='py-2 text-right'>
                  <button
                    type='button'
                    onClick={() =>
                      notify(
                        t("settings.backups.restored.title"),
                        t("settings.backups.restored.description", { date }),
                      )
                    }
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-8 px-3 text-xs",
                    )}>
                    {t("settings.backups.restore")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
};
