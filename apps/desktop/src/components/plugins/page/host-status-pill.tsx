import { useTranslation } from "react-i18next";
import type { HostStatus } from "@/components/plugins/page/host-status";
import { tint } from "@/components/plugins/plugin-identity";

/** The rounded status pill the plugin page's host bar draws next to the name. */
export const HostStatusPill = ({ status }: { status: HostStatus }) => {
  const { t } = useTranslation();
  return (
    <span
      className='flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5'
      style={{ backgroundColor: tint(status.color, "1A") }}>
      <span
        className='size-1.5 rounded-full'
        style={{ backgroundColor: status.color }}
      />
      <span
        className='font-medium text-[11px] leading-[normal]'
        style={{ color: status.color }}>
        {t(status.labelKey)}
      </span>
    </span>
  );
};
