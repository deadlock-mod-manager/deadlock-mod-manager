import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import {
  ContextMenuCheckboxItem,
  ContextMenuSeparator,
} from "@deadlock-mods/ui/components/context-menu";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { ModCompatibilityController } from "@/hooks/use-mod-compatibility";
import { cn } from "@/lib/utils";
import type { LocalMod } from "@/types/mods";
import { ModStatus } from "@/types/mods";

export function PerModCompatibilityControl({
  mod,
  compatibility,
  variant = "inline",
}: {
  mod: LocalMod;
  compatibility: ModCompatibilityController;
  variant?: "inline" | "context-menu";
}) {
  const { t } = useTranslation();
  const id = useId();
  const descriptionId = `${id}-description`;
  const { preference, changePreference, game, pendingChanges, gamePath } =
    compatibility;
  if (
    mod.status !== ModStatus.Installed &&
    preference.data?.[mod.remoteId] === undefined
  )
    return null;
  const checked = preference.data?.[mod.remoteId] ?? false;
  const disabled =
    !gamePath ||
    preference.isPending ||
    preference.isError ||
    game.isPending ||
    game.isError ||
    !!game.data ||
    pendingChanges > 0;
  const change = (enabled: boolean | "indeterminate") =>
    changePreference.mutate({ modId: mod.remoteId, enabled: enabled === true });
  const explanation = (
    <>
      <p>{t("myMods.compatibility.perModDescription")}</p>
      {game.data ? <p>{t("myMods.compatibility.closeGame")}</p> : null}
      {preference.isError || game.isError ? (
        <p>{t("myMods.compatibility.loadFailed")}</p>
      ) : null}
    </>
  );
  if (variant === "context-menu") {
    return (
      <>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem
          checked={checked}
          disabled={disabled}
          aria-label={t("myMods.compatibility.forMod", { name: mod.name })}
          aria-describedby={descriptionId}
          onCheckedChange={change}>
          {t("myMods.compatibility.perMod")}
        </ContextMenuCheckboxItem>
        <div
          id={descriptionId}
          className='max-w-64 space-y-2 px-2 py-2 text-xs leading-relaxed text-muted-foreground'>
          {explanation}
        </div>
      </>
    );
  }
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Label
            htmlFor={id}
            className={cn(
              "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 text-xs font-normal text-muted-foreground",
              checked && "text-primary",
              disabled && "cursor-not-allowed opacity-50",
            )}
            onClick={(event) => event.stopPropagation()}>
            <Checkbox
              id={id}
              checked={checked}
              disabled={disabled}
              className='border-muted-foreground/50 data-[state=checked]:border-primary'
              aria-label={t("myMods.compatibility.forMod", { name: mod.name })}
              aria-describedby={descriptionId}
              onCheckedChange={change}
            />
            {t("myMods.compatibility.label")}
          </Label>
        </TooltipTrigger>
        <TooltipContent className='max-w-xs space-y-2'>
          {explanation}
        </TooltipContent>
      </Tooltip>
      <div id={descriptionId} className='sr-only'>
        {explanation}
      </div>
    </>
  );
}
