import { Button } from "@deadlock-mods/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { FileTextIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { getPluginAssetUrl } from "@/lib/plugins";
import { FrenchTaxReceipt } from "./tax-receipt";

const memeUrl = getPluginAssetUrl(
  "themes",
  "public/pre-defined/french/meme.png",
);

export function FrenchMeme() {
  const { t } = useTranslation();
  const label = t("plugins.french.viewTaxNotice");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className='h-auto min-h-10 max-w-full shrink-0 self-start whitespace-normal border-current/40 bg-transparent px-4 py-2.5 text-left text-xs text-inherit shadow-none hover:border-current/70 hover:bg-background/10 focus-visible:ring-current sm:self-center sm:text-sm'
          icon={<FileTextIcon aria-hidden />}
          type='button'
          variant='outline'>
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        aria-label={label}
        className='max-h-[var(--radix-popover-content-available-height)] w-[30rem] max-w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto rounded-lg p-1.5 motion-reduce:!animate-none'
        sideOffset={8}>
        <img
          alt={t("plugins.french.memeAlt")}
          className='mb-1.5 h-auto w-full rounded-sm'
          height={228}
          src={memeUrl}
          width={480}
        />
        <FrenchTaxReceipt />
      </PopoverContent>
    </Popover>
  );
}
