import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import { useTranslation } from "react-i18next";

interface ServerDetailPlayersSectionProps {
  players: ServerBrowserEntry["players"];
}

const ServerDetailPlayersSection = ({
  players,
}: ServerDetailPlayersSectionProps) => {
  const { t } = useTranslation();
  return (
    <section className='space-y-2'>
      <h3 className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
        {t("servers.detail.playersTitle")} ({players.length})
      </h3>
      {players.length === 0 ? (
        <p className='text-xs text-muted-foreground'>
          {t("servers.detail.noPlayers")}
        </p>
      ) : (
        <ul className='space-y-1 text-xs' role='list'>
          {players.map((p, idx) => (
            <li
              key={`${p.name}-${idx}`}
              className='flex items-center justify-between gap-2 rounded-sm bg-card px-2 py-1'>
              <span className='truncate'>{p.name}</span>
              {p.hero && (
                <span className='shrink-0 truncate font-mono text-[10px] uppercase text-muted-foreground'>
                  {p.hero}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ServerDetailPlayersSection;
