import type { ModAuthorDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { PaintBrushIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { useCommissionAuthor } from "@/hooks/use-commission-author";

interface CommissionAuthorButtonProps {
  author: ModAuthorDto | null | undefined;
}

/** Shown only for verified commissions authors who are taking requests. */
export const CommissionAuthorButton = ({
  author,
}: CommissionAuthorButtonProps) => {
  const { t } = useTranslation();
  const commission = useCommissionAuthor(author);
  const open = useMutation({
    mutationFn: (url: string) => openUrl(url),
    meta: { skipGlobalErrorHandler: true },
    onError: () => toast.error(t("authorPage.openCommissionError")),
  });
  const requestUrl = commission?.requestUrl;
  if (!author || !requestUrl) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          disabled={open.isPending}
          onClick={() => open.mutate(requestUrl)}
          variant='outline'>
          <PaintBrushIcon className='h-4 w-4' weight='duotone' />
          {t("authorPage.commission")}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {t("authorPage.commissionTooltip", { author: author.name })}
      </TooltipContent>
    </Tooltip>
  );
};
