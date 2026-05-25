import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { PlusIcon } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import {
  commandExistsInContent,
  formatCommandPreview,
} from "@/lib/autoexec/autoexec-content";
import type { FlatAutoexecCommand } from "@/lib/autoexec/predefined-commands";

type AutoexecCommandRowProps = {
  command: FlatAutoexecCommand;
  content: string;
  onAddCommand: (command: FlatAutoexecCommand) => void;
};

export const AutoexecCommandRow = ({
  command,
  content,
  onAddCommand,
}: AutoexecCommandRowProps) => {
  const { t } = useTranslation();
  const isAdded = commandExistsInContent(content, command.command);
  const description = t(`settings.autoexecCommands.${command.id}.description`);
  const isDefaultCommand = command.intent === "default";

  return (
    <div className='flex flex-row items-center justify-between gap-4 rounded-md border border-border/30 bg-background/40 px-4 py-3 transition-colors hover:bg-muted/30'>
      <div className='flex min-w-0 flex-col gap-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <code className='font-mono text-sm text-foreground'>
            {formatCommandPreview(command.command, command.value)}
          </code>
          {isDefaultCommand && (
            <Badge variant='outline'>
              {t("settings.autoexecCommandDefaultBadge")}
            </Badge>
          )}
        </div>
        <p className='text-muted-foreground text-sm'>{description}</p>
      </div>

      <div className='flex shrink-0 items-center gap-2'>
        {isAdded ? (
          <Badge variant='secondary'>
            {t("settings.autoexecCommandAddedBadge")}
          </Badge>
        ) : (
          <Button
            onClick={() => onAddCommand(command)}
            size='sm'
            type='button'
            variant='outline'>
            <PlusIcon className='h-4 w-4' />
            {t("settings.autoexecCommandAdd")}
          </Button>
        )}
      </div>
    </div>
  );
};
