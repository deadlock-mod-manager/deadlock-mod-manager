import { useTranslation } from "react-i18next";
import type { BuildState } from "./build-state";

export function Badge({
  state,
  tinted,
}: {
  state: BuildState;
  tinted: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span className={`badge badge--${state}${tinted ? " badge--tinted" : ""}`}>
      <span className='badge__dot' />
      {t(`build.${state}`)}
    </span>
  );
}
