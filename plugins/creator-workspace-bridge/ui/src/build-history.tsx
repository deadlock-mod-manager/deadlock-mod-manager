import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { type BuildEntry } from "./bridge";
import type { DeployControl } from "./build-state";
import { HistoryRow } from "./history-row";

const HISTORY_LIMIT = 8;

/** Older builds listed before "Show older builds". */
const HISTORY_PREVIEW = 3;

type BuildHistoryProps = {
  total: number;
  older: BuildEntry[];
  expanded: boolean;
  isSaving: boolean;
  deploy: DeployControl;
  onToggle: () => void;
};

export function BuildHistory({
  total,
  older,
  expanded,
  isSaving,
  deploy,
  onToggle,
}: BuildHistoryProps) {
  const { t } = useTranslation();
  const visible = expanded ? older : older.slice(0, HISTORY_PREVIEW);
  return (
    <section className='card card--history' aria-labelledby='history-heading'>
      <div className='card__head history__head'>
        <h2 id='history-heading'>{t("history.heading")}</h2>
        <span className='spacer' />
        <span className='muted'>
          {t("history.count", { count: total, limit: HISTORY_LIMIT })}
        </span>
      </div>
      {older.length === 0 ? (
        <p className='hint history__empty'>{t("history.empty")}</p>
      ) : (
        <>
          <div id='history-list' className='history__list'>
            {visible.map((build) => (
              <HistoryRow key={build.hash} build={build} deploy={deploy} />
            ))}
          </div>
          {older.length > HISTORY_PREVIEW && (
            <div className='history__more'>
              <button
                type='button'
                className='button button--ghost'
                aria-expanded={expanded}
                aria-controls='history-list'
                disabled={isSaving}
                onClick={onToggle}>
                {expanded ? <CaretUpIcon /> : <CaretDownIcon />}
                {t(expanded ? "history.hide" : "history.show")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
