import { useTranslation } from "react-i18next";
import { usePermissionCopy } from "@/components/plugins/plugin-permissions";
import type { ExternalPluginPermission } from "@/types/generated/ExternalPluginPermission";

export const ChangeRow = ({
  permission,
  change,
}: {
  permission: ExternalPluginPermission;
  change: "new" | "unchanged" | "removed";
}) => {
  const isNew = change === "new";
  const { t } = useTranslation();
  const describe = usePermissionCopy();
  const copy = describe(permission);
  const PermissionIcon = copy.icon;
  return (
    <div
      className={
        isNew
          ? "flex w-full items-center gap-3 rounded-[10px] bg-[#60A5FA0F] px-[14px] py-3 ring-1 ring-[#60A5FA4D] ring-inset"
          : "flex w-full items-center gap-3 rounded-[10px] bg-card px-[14px] py-3 ring-1 ring-[#FFFFFF0F] ring-inset"
      }>
      <span
        className={
          isNew
            ? "flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-[#60A5FA1F] text-[#60A5FA]"
            : "flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-[#FFFFFF0A] text-muted-foreground"
        }>
        <PermissionIcon size={15} />
      </span>
      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span
          className={
            isNew
              ? "font-semibold text-[13px] text-foreground leading-[normal]"
              : "font-semibold text-[13px] text-muted-foreground leading-[normal]"
          }>
          {copy.title}
        </span>
        {isNew ? (
          <span className='text-[12px] text-muted-foreground leading-[17px]'>
            {copy.detail}
          </span>
        ) : null}
      </div>
      <span
        className={
          isNew
            ? "shrink-0 rounded-[6px] bg-[#60A5FA26] px-2 py-0.5 font-semibold text-[#60A5FA] text-[11px] leading-[normal]"
            : "shrink-0 rounded-[6px] bg-[#FFFFFF0A] px-2 py-0.5 font-semibold text-[11px] text-muted-foreground leading-[normal]"
        }>
        {t(`plugins.page.update.${change}`)}
      </span>
    </div>
  );
};
