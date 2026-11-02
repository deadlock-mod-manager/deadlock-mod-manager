import { Button } from "@deadlock-mods/ui/components/button";
import { Copy, Check } from "@deadlock-mods/ui/icons";
import { useMutation } from "@tanstack/react-query";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useTranslation } from "react-i18next";
import { formatCompatibilityFindings } from "@/lib/mods/compatibility-diagnostics";
import type { LocalizationOverlayAnalysis } from "./localization-conflict-review";

interface CopyCompatibilityFindingsProps {
  analysis: LocalizationOverlayAnalysis;
  modNames: ReadonlyMap<string, string>;
  modId?: string;
}

export function CopyCompatibilityFindings({
  analysis,
  modNames,
  modId,
}: CopyCompatibilityFindingsProps) {
  const { t } = useTranslation();
  const copy = useMutation({
    mutationFn: () =>
      writeText(formatCompatibilityFindings(analysis, modNames, modId)),
    meta: { skipGlobalErrorHandler: true },
  });
  return (
    <div className='shrink-0'>
      <Button
        variant='ghost'
        size='sm'
        disabled={copy.isPending}
        onClick={() => copy.mutate()}
        icon={
          copy.isSuccess ? (
            <Check className='size-3.5' />
          ) : (
            <Copy className='size-3.5' />
          )
        }>
        {t(
          copy.isSuccess
            ? "myMods.compatibility.copied"
            : modId
              ? "myMods.compatibility.copyFindings"
              : "myMods.compatibility.copyAllFindings",
        )}
      </Button>
      {copy.isError ? (
        <p role='alert' className='text-destructive text-xs'>
          {t("myMods.compatibility.copyFailed")}
        </p>
      ) : null}
    </div>
  );
}
