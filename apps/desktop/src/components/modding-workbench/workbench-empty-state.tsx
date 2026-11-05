import { Button } from "@deadlock-mods/ui/components/button";
import {
  ArrowRightIcon,
  CubeIcon,
  FolderOpenIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

interface Props {
  addonsEnabled: boolean;
  disabled: boolean;
  opening: boolean;
  onOpenArchive: () => void;
  onCreateAddon: () => void;
}

export function WorkbenchEmptyState({
  addonsEnabled,
  disabled,
  opening,
  onOpenArchive,
  onCreateAddon,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className='flex h-full flex-col overflow-auto'>
      <div className='flex h-11 shrink-0 items-center gap-2 border-b px-4 text-xs text-muted-foreground'>
        <CubeIcon aria-hidden className='size-4' />
        {t("workbenchHome.workspace")}
      </div>
      <div className='flex min-h-fit flex-1 flex-col items-center justify-center px-6 py-10 text-center'>
        <CubeIcon
          aria-hidden
          weight='duotone'
          className='mb-6 size-12 text-primary/70'
        />
        <h2 className='text-2xl font-semibold tracking-tight'>
          {t("workbenchHome.title")}
        </h2>
        <p className='mt-3 max-w-md text-sm leading-relaxed text-muted-foreground'>
          {t("workbenchHome.description")}
        </p>
        <div className='mt-6 flex flex-wrap justify-center gap-2'>
          <Button
            disabled={disabled}
            isLoading={opening}
            onClick={onOpenArchive}>
            <FolderOpenIcon aria-hidden />
            {t("workbenchArchives.open")}
          </Button>
          <Button
            variant='outline'
            disabled={disabled || !addonsEnabled}
            aria-describedby={
              !addonsEnabled ? "workbench-create-hint" : undefined
            }
            onClick={onCreateAddon}>
            <PlusIcon aria-hidden />
            {t("workbenchAuthoring.createAddon")}
          </Button>
        </div>
        {!addonsEnabled ? (
          <p
            id='workbench-create-hint'
            className='mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground'>
            {t("workbenchHome.createHint")}
          </p>
        ) : null}
        <ol
          aria-label={t("workbenchGuide.title")}
          className='mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t pt-5 text-xs text-muted-foreground'>
          <li>{t("workbenchHome.browse")}</li>
          <li aria-hidden>
            <ArrowRightIcon className='size-3' />
          </li>
          <li>{t("workbenchHome.edit")}</li>
          <li aria-hidden>
            <ArrowRightIcon className='size-3' />
          </li>
          <li>{t("workbenchHome.test")}</li>
        </ol>
      </div>
    </div>
  );
}
