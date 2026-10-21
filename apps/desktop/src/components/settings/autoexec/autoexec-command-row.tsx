import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { CheckIcon, PlusIcon } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { commandExistsInContent } from "@/lib/autoexec/autoexec-content";
import type { FlatAutoexecCommand } from "@/lib/autoexec/predefined-commands";
import { OutdatedConvarBadge } from "../outdated-convar-badge";

type AutoexecCommandRowProps = {
  command: FlatAutoexecCommand;
  content: string;
  isOutdated: boolean;
  onAddCommand: (command: FlatAutoexecCommand) => void;
  onRevealCommand: (command: FlatAutoexecCommand) => void;
};

export const AutoexecCommandRow = ({
  command,
  content,
  isOutdated,
  onAddCommand,
  onRevealCommand,
}: AutoexecCommandRowProps) => {
  const { t } = useTranslation();
  const isAdded = commandExistsInContent(content, command.command);
  const description = t(`settings.autoexecCommands.${command.id}.description`);
  const isDefaultCommand = command.intent === "default";

  return (
    <div className='flex items-center justify-between gap-3 border-border/20 border-b px-3 py-2 transition-colors hover:bg-muted/30'>
      <div className='flex min-w-0 flex-col'>
        <div className='flex flex-wrap items-center gap-1.5'>
          <code className='font-mono text-[13px] text-foreground'>
            {command.command}
            {command.value.length > 0 && (
              <span className='text-primary'> {command.value}</span>
            )}
          </code>
          {isDefaultCommand && (
            <Badge variant='outline'>
              {t("settings.autoexecCommandDefaultBadge")}
            </Badge>
          )}
          {isOutdated && <OutdatedConvarBadge />}
        </div>
        <p
          className='truncate text-muted-foreground text-xs'
          title={description}>
          {description}
        </p>
      </div>

      {isAdded ? (
        <Button
          className='shrink-0 text-green-400 hover:text-foreground'
          icon={<CheckIcon className='h-3.5 w-3.5' />}
          onClick={() => onRevealCommand(command)}
          size='sm'
          type='button'
          variant='ghost'>
          {t("settings.autoexecCommandAddedBadge")}
        </Button>
      ) : (
        <Button
          className='shrink-0'
          icon={<PlusIcon className='h-3.5 w-3.5' />}
          onClick={() => onAddCommand(command)}
          size='sm'
          type='button'
          variant='outline'>
          {t("settings.autoexecCommandAdd")}
        </Button>
      )}
    </div>
  );
};
