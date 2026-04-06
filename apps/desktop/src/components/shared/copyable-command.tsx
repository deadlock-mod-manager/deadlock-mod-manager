import { toast } from "@deadlock-mods/ui/components/sonner";
import { Check, Copy, Terminal } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export const CopyableCommand = ({ command }: { command: string }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    toast.success(t("modDetail.mapHowToPlay.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      className='group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 font-mono text-sm transition-all hover:border-primary/40 hover:bg-primary/10'
      onClick={handleCopy}
      type='button'>
      <Terminal className='h-4 w-4 shrink-0 text-primary/60' />
      <span className='flex-1 text-left text-primary'>{command}</span>
      <span className='flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground'>
        {copied ? (
          <>
            <Check className='h-3.5 w-3.5 text-green-500' />
            <span className='text-green-500'>
              {t("modDetail.mapHowToPlay.copied")}
            </span>
          </>
        ) : (
          <Copy className='h-3.5 w-3.5' />
        )}
      </span>
    </button>
  );
};
