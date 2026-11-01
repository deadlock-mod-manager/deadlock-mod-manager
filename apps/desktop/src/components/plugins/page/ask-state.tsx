import { CheckCircleIcon, CircleDashedIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { TONE_COLOR } from "@/components/plugins/plugin-status";

export const AskState = ({ ready }: { ready: boolean }) => {
  const { t } = useTranslation();
  const color = ready ? TONE_COLOR.ok : TONE_COLOR.warn;
  const StateIcon = ready ? CheckCircleIcon : CircleDashedIcon;
  return (
    <span className='flex shrink-0 items-center gap-[5px]'>
      <StateIcon color={color} size={15} />
      <span
        className='font-semibold text-[12px] leading-[normal]'
        style={{ color }}>
        {t(ready ? "plugins.page.setup.ready" : "plugins.page.setup.needed")}
      </span>
    </span>
  );
};
