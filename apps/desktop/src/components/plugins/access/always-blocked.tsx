import { ProhibitIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { blockedScopes } from "@/components/plugins/plugin-permissions";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

const ROW_SIZE = 3;

/** What no grant can unlock for this plugin, in rows of three chips. */
export const AlwaysBlocked = ({
  plugin,
}: {
  plugin: ExternalPluginSummary;
}) => {
  const { t } = useTranslation();
  const scopes = blockedScopes([
    ...plugin.requiredPermissions,
    ...plugin.optionalPermissions,
  ]);
  const rows = Array.from(
    { length: Math.ceil(scopes.length / ROW_SIZE) },
    (_, index) => scopes.slice(index * ROW_SIZE, (index + 1) * ROW_SIZE),
  );
  return (
    <div className='flex w-full flex-col gap-[8px] px-[2px] pt-[4px]'>
      <div className='flex items-center gap-[6px]'>
        <ShieldCheckIcon color='#4ADE80' size={14} />
        <span className='font-semibold text-[12px] text-foreground leading-[normal]'>
          {t("plugins.access.blocked.title")}
        </span>
      </div>
      {rows.map((row) => (
        <div className='flex w-full gap-[6px]' key={row[0]}>
          {row.map((scope) => (
            <span
              className='flex items-center gap-[5px] rounded-[6px] px-[8px] py-[3px] outline outline-1 -outline-offset-1 outline-foreground/[0.08]'
              key={scope}>
              <ProhibitIcon className='text-muted-foreground' size={11} />
              <span className='text-muted-foreground text-[11px] leading-[normal]'>
                {t(`plugins.access.blocked.${scope}`)}
              </span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};
