import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { FolderOpen } from "@deadlock-mods/ui/icons";
import { useMutation } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";

type ModdingToolPathProps = {
  id: string;
  label: string;
  value: string;
  directory: boolean;
  disabled: boolean;
  onChange: (path: string) => void;
};

export const ModdingToolPath = ({
  id,
  label,
  value,
  directory,
  disabled,
  onChange,
}: ModdingToolPathProps) => {
  const { t } = useTranslation();
  const browse = useMutation({
    mutationFn: () => open({ directory, multiple: false, title: label }),
    onSuccess: (path) => {
      if (path) onChange(path);
    },
  });

  return (
    <div className='space-y-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <div className='flex gap-2'>
        <Input
          id={id}
          className='min-w-0 flex-1 font-mono text-xs'
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type='button'
          size='icon'
          variant='outline'
          aria-label={t("moddingTools.browse", { name: label })}
          disabled={disabled || browse.isPending}
          onClick={() => browse.mutate()}>
          <FolderOpen className='size-4' />
        </Button>
      </div>
    </div>
  );
};
