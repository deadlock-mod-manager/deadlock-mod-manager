import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { EyedropperIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getEyeDropperConstructor } from "@/components/hsv-color-picker/eye-dropper";

export function ParticleColorSampler({
  busy,
  onPick,
  onPickPreview,
}: {
  busy: boolean;
  onPick: (hex: string) => void;
  onPickPreview: () => void;
}) {
  const { t } = useTranslation();
  const pick = useMutation({
    mutationFn: async () => {
      const EyeDropper = getEyeDropperConstructor();
      if (!EyeDropper) return "unavailable";
      try {
        const result = await new EyeDropper().open();
        onPick(result.sRGBHex);
        return "picked";
      } catch (error) {
        return error instanceof DOMException && error.name === "AbortError"
          ? "cancelled"
          : "failed";
      }
    },
  });
  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size='icon'
            variant='outline'
            disabled={busy || pick.isPending}
            aria-label={t("particleColors.pickColor")}
            title={t("particleColors.pickColor")}>
            <EyedropperIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            onSelect={() => {
              pick.reset();
              onPickPreview();
            }}>
            {t("particleColors.pickPreview")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!getEyeDropperConstructor()}
            onSelect={() => pick.mutate()}>
            {t("particleColors.pickScreen")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {pick.data === "failed" || pick.data === "unavailable" ? (
        <p role='alert' className='mt-1 max-w-60 text-xs text-destructive'>
          {t("particleColors.screenPickFailed")}
        </p>
      ) : null}
    </div>
  );
}
