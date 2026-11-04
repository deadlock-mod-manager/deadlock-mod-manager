import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Copy } from "@deadlock-mods/ui/icons";
import type { TemplateField } from "@/components/settings/game-presence/presence-templates";

interface PlaceholderMeta {
  token: string;
  tooltipKey: string;
}

const PLACEHOLDERS: PlaceholderMeta[] = [
  { token: "{hero}", tooltipKey: "hero" },
  { token: "{heroPresence}", tooltipKey: "heroPresence" },
  { token: "{mode}", tooltipKey: "mode" },
  { token: "{partySize}", tooltipKey: "partySize" },
  { token: "{partyMax}", tooltipKey: "partyMax" },
];

interface PlaceholderButtonsProps {
  field: TemplateField;
  onInsert: (field: TemplateField, placeholder: string) => void;
  t: (key: string) => string;
}

export const PlaceholderButtons = ({
  field,
  onInsert,
  t,
}: PlaceholderButtonsProps) => (
  <TooltipProvider delayDuration={300}>
    <div className='flex flex-wrap gap-1.5'>
      {PLACEHOLDERS.map(({ token, tooltipKey }) => (
        <Tooltip key={`${field}-${token}`}>
          <TooltipTrigger asChild>
            <Button
              className='h-7 gap-1 rounded-full px-2 font-mono text-[11px]'
              onClick={() => onInsert(field, token)}
              size='sm'
              type='button'
              variant='outline'>
              <Copy className='size-3' />
              {token}
            </Button>
          </TooltipTrigger>
          <TooltipContent className='max-w-[220px] space-y-1 text-center'>
            <p>
              {t(`gamePresence.placeholderTooltips.${tooltipKey}.description`)}
            </p>
            <p className='font-mono text-white/60'>
              {t(`gamePresence.placeholderTooltips.${tooltipKey}.example`)}
            </p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  </TooltipProvider>
);
