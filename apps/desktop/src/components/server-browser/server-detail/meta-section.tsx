import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import { useTranslation } from "react-i18next";
import RegionFlag from "../region-flag";

interface ServerDetailMetaSectionProps {
  server: ServerBrowserEntry;
}

const formatRelative = (iso: string) => {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
};

const ServerDetailMetaSection = ({ server }: ServerDetailMetaSectionProps) => {
  const { t } = useTranslation();
  const unknown = t("servers.detail.unknown");

  return (
    <section className='space-y-2'>
      <h3 className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
        {t("servers.detail.metaTitle")}
      </h3>
      <dl className='grid grid-cols-2 gap-y-1.5 text-xs'>
        <dt className='text-muted-foreground'>{t("servers.table.map")}</dt>
        <dd className='font-mono'>{server.map || unknown}</dd>

        <dt className='text-muted-foreground'>{t("servers.table.mode")}</dt>
        <dd className='font-mono capitalize'>{server.game_mode || unknown}</dd>

        <dt className='text-muted-foreground'>
          {t("servers.detail.metaPort")}
        </dt>
        <dd className='font-mono tabular-nums'>{server.port}</dd>

        <dt className='text-muted-foreground'>
          {t("servers.detail.metaVersion")}
        </dt>
        <dd className='font-mono'>{server.version || unknown}</dd>

        <dt className='text-muted-foreground'>
          {t("servers.detail.metaSourceRelay")}
        </dt>
        <dd className='truncate'>
          {server.source_region ? (
            <RegionFlag region={server.source_region} />
          ) : (
            <span className='font-mono'>
              {new URL(server.source_relay).hostname}
            </span>
          )}
        </dd>

        <dt className='text-muted-foreground'>
          {t("servers.detail.metaLastSeen")}
        </dt>
        <dd className='font-mono text-[11px] tabular-nums'>
          {formatRelative(server.last_seen)}
        </dd>
      </dl>
    </section>
  );
};

export default ServerDetailMetaSection;
