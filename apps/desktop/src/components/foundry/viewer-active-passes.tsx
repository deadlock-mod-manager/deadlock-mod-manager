import { useTranslation } from "react-i18next";
import { type ViewerLook } from "./viewer-tool-types";

/** The model's switchable body groups and the choice shown for each. */
const PASS_ORDER = ["bloom", "antialias", "outlines", "wireframe"] as const;

/** The render passes that are on, at a glance; the View menu changes them. */
export const ViewerActivePasses = ({ look }: { look: ViewerLook }) => {
  const { t } = useTranslation();
  const active = PASS_ORDER.filter((pass) => look[pass]);
  if (active.length === 0) return null;
  return (
    <div className='flex h-8 items-center gap-1'>
      {active.map((pass) => (
        <span
          className='rounded-[5px] bg-secondary/90 px-1.5 py-0.5 font-medium text-[11px] text-secondary-foreground'
          key={pass}>
          {t(`modelPreview.passChips.${pass}`)}
        </span>
      ))}
    </div>
  );
};
