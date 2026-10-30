import { Loader2 } from "@deadlock-mods/ui/icons";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  INFO_COLOR,
  CAUTION_COLOR,
  LOSS_COLOR,
  MUTED_COLOR,
  tint,
  WIN_COLOR,
} from "@/components/stats/chart-fx";
import {
  PANEL_CLASS,
  RankTag,
  Tag,
  UnrankedTag,
  WinratePill,
} from "@/components/stats/live-parts";
import {
  LiveHeroAvatar,
  LivePlayerRow,
  playerKey,
} from "@/components/stats/live-player";
import type { RankAsset } from "@/lib/stats/api";
import { formatDecimal } from "@/lib/stats/format";
import {
  FORM_LENGTH,
  type LiveLobby,
  lobbyEntryOf,
  type ScoutingTag,
  scoutingTags,
} from "@/lib/stats/live-lobby";
import {
  type ResolvedPlayer,
  teamColor,
  teamName,
} from "@/lib/stats/live-teams";
import { cn } from "@/lib/utils";
import type { Team } from "@/types/generated/Team";

const tagView = (tag: ScoutingTag, t: TFunction) => {
  switch (tag.kind) {
    case "beatYou":
      return {
        label: t("stats.live.scouting.beatYou", {
          lost: tag.lost,
          count: tag.count,
        }),
        color: LOSS_COLOR,
      };
    case "againstYou":
      return {
        label: t("stats.live.scouting.againstYou", { count: tag.count }),
        color: CAUTION_COLOR,
      };
    case "withYou":
      return {
        label: t("stats.live.scouting.withYou", { count: tag.count }),
        color: WIN_COLOR,
      };
    case "noRecord":
      return { label: t("stats.live.labels.noRecord"), color: MUTED_COLOR };
    case "firstGame":
      return { label: t("stats.live.labels.firstGame"), color: MUTED_COLOR };
    case "oneTrick":
      return { label: t("stats.live.scouting.oneTrick"), color: INFO_COLOR };
    case "streak":
      return {
        label: t(
          tag.won
            ? "stats.live.scouting.winStreak"
            : "stats.live.scouting.lossStreak",
          { count: tag.length },
        ),
        color: tag.won ? WIN_COLOR : LOSS_COLOR,
      };
  }
};

/** Recent results as beads, oldest on the left so the latest reads last. */
const FormBeads = ({ form }: { form: boolean[] | undefined }) => (
  <span className='flex w-[98px] shrink-0 items-center gap-0.5'>
    {Array.from({ length: FORM_LENGTH }, (_, slot) => {
      const won = form?.[FORM_LENGTH - 1 - slot];
      return (
        <span
          className='w-2 rounded-[2px]'
          key={slot}
          style={{
            height: won === undefined ? 4 : 14,
            backgroundColor:
              won === undefined
                ? "hsl(var(--foreground) / 0.08)"
                : tint(won ? WIN_COLOR : LOSS_COLOR, won ? 70 : 50),
          }}
        />
      );
    })}
  </span>
);

const ScoutingRow = ({
  entry,
  color,
  isEnemy,
  separated,
  lobby,
  rankAssets,
}: {
  entry: ResolvedPlayer;
  color: string;
  isEnemy: boolean;
  separated: boolean;
  lobby: LiveLobby;
  rankAssets: RankAsset[];
}) => {
  const { t } = useTranslation();
  const { player, hero } = entry;
  const { record, onHero, badge, form } = lobbyEntryOf(lobby, entry);
  const tags = scoutingTags(lobby, entry, isEnemy).map((tag) =>
    tagView(tag, t),
  );
  return (
    <LivePlayerRow
      className={cn(
        "flex items-center gap-3 px-[7px] py-2",
        separated && "border-t-foreground/[0.04]",
      )}
      color={color}
      isLocal={player.isLocal}>
      <LiveHeroAvatar
        className='h-[38px] w-[38px]'
        entry={entry}
        radius='rounded-[10px]'
        ring={player.isLocal ? color : undefined}
      />
      <div className='flex min-w-0 flex-1 flex-col gap-[3px]'>
        <span className='flex min-w-0 items-center gap-[7px] leading-[17px]'>
          <span className='truncate font-semibold text-[13px]'>
            {player.name}
          </span>
          {badge === undefined ? (
            record && (
              <UnrankedTag
                className='text-[11.5px]'
                label={t("stats.live.labels.unranked")}
              />
            )
          ) : (
            <RankTag
              badge={badge}
              className='text-[11.5px]'
              rankAssets={rankAssets}
            />
          )}
        </span>
        <span className='flex min-w-0 items-center gap-[7px] text-[11.5px] text-muted-foreground leading-[15px]'>
          <span className='truncate'>{player.heroName ?? hero?.name}</span>
          {tags.map((tag) => (
            <Tag color={tag.color} key={tag.label}>
              {tag.label}
            </Tag>
          ))}
        </span>
      </div>
      <span className='flex w-24 shrink-0 items-center gap-[7px] font-mono font-semibold text-[12.5px] leading-4 tabular-nums'>
        {onHero ? (
          <>
            {onHero.matches}
            <WinratePill record={onHero} />
          </>
        ) : player.accountId !== null && lobby.isPending ? (
          <Loader2 className='h-3.5 w-3.5 animate-spin text-muted-foreground' />
        ) : (
          <span className='font-sans font-normal text-muted-foreground text-xs'>
            {record ? t("stats.live.scouting.noneYet") : "–"}
          </span>
        )}
      </span>
      <span className='w-[34px] shrink-0 text-right font-mono text-[12.5px] leading-4 tabular-nums'>
        {record ? formatDecimal(record.overall.kda, 1) : "–"}
      </span>
      <FormBeads form={form} />
    </LivePlayerRow>
  );
};

/** One team in the scouting report: rank, record on the locked hero, and form. */
export const ScoutingTeam = ({
  players,
  team,
  isEnemy,
  lobby,
  rankAssets,
}: {
  players: ResolvedPlayer[];
  team: Team;
  isEnemy: boolean;
  lobby: LiveLobby;
  rankAssets: RankAsset[];
}) => {
  const { t } = useTranslation();
  const color = teamColor(team);
  return (
    <div
      className={cn(
        PANEL_CLASS,
        "flex flex-col gap-0.5 px-[19px] pt-[17px] pb-[7px]",
      )}>
      <div className='flex items-center justify-between pb-2.5'>
        <span className='flex items-center gap-2'>
          <span
            className='h-4 w-1 rounded-[2px]'
            style={{ backgroundColor: color }}
          />
          <span className='font-medium text-[15px] leading-[19px]'>
            {t(teamName(team))}
          </span>
          {!isEnemy && (
            <span className='text-muted-foreground text-xs leading-4'>
              {t("stats.live.labels.yourTeam")}
            </span>
          )}
        </span>
        <span className='flex gap-3 pr-2 font-semibold text-[10px] text-muted-foreground/60 uppercase leading-[13px] tracking-[0.8px]'>
          <span className='w-24'>{t("stats.live.labels.onHero")}</span>
          <span className='w-[34px] text-right'>
            {t("stats.live.scouting.kda")}
          </span>
          <span className='w-[98px]'>{t("stats.live.scouting.form")}</span>
        </span>
      </div>
      {players.map((entry, index) => (
        <ScoutingRow
          color={color}
          entry={entry}
          isEnemy={isEnemy}
          key={playerKey(entry, index)}
          lobby={lobby}
          rankAssets={rankAssets}
          separated={index > 0}
        />
      ))}
    </div>
  );
};
