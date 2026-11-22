import type { ModAuthorDto } from "@deadlock-mods/shared";
import { Button, type ButtonProps } from "@deadlock-mods/ui/components/button";
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
  variant?: ButtonProps["variant"];
  /** Adds a handwritten note pointing at the button. */
  nudge?: boolean;
}

/** Shown only for verified commissions authors who are taking requests. */
export const CommissionAuthorButton = ({
  author,
  variant = "outline",
  nudge = false,
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

  const button = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          disabled={open.isPending}
          onClick={() => open.mutate(requestUrl)}
          variant={variant}>
          <PaintBrushIcon className='h-4 w-4' weight='duotone' />
          {t("authorPage.commission")}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {t("authorPage.commissionTooltip", { author: author.name })}
      </TooltipContent>
    </Tooltip>
  );

  if (!nudge) return button;
  return (
    <span className='commission-nudge-wrap relative flex'>
      <span
        aria-hidden='true'
        className='commission-nudge pointer-events-none absolute right-8 bottom-full mb-0.5 flex items-start gap-1 whitespace-nowrap text-primary'>
        {t("authorPage.commissionNudge")}
        <svg
          className='commission-nudge-arrow mt-2.5 -mb-3 h-7 w-8'
          fill='none'
          viewBox='0 0 26 20'>
          <path
            d='M3 4C13 3 20 7 19 17M19 17l-5-4M19 17l4-5'
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth='1.5'
          />
        </svg>
      </span>
      {button}
    </span>
  );
};
