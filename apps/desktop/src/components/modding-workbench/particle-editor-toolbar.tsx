import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  DotsThreeIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { useParticleColorSession } from "./use-particle-color-session";

interface Props {
  editor: ReturnType<typeof useParticleColorSession>;
  selected: string;
  blocked: boolean;
  proposalCount: number;
  preview: boolean;
  onPreview: () => void;
  onDiscard: () => void;
}

export function ParticleEditorToolbar({
  editor,
  selected,
  blocked,
  proposalCount,
  preview,
  onPreview,
  onDiscard,
}: Props) {
  const { t } = useTranslation();
  const { dirty, busy, session, dispatch } = editor;
  const disabled = busy || blocked;
  const invalid = dirty.some((file) => !!file.diagnostic);
  const paths = dirty.map((file) => file.path);
  return (
    <div className='flex shrink-0 flex-wrap items-center gap-2 border-b pb-3'>
      <Button
        size='sm'
        disabled={disabled || !dirty.length || invalid}
        onClick={() => editor.save.mutate({ paths, compile: false })}>
        {t("particleColors.saveChanges", { count: dirty.length })}
      </Button>
      <Button
        size='sm'
        variant='outline'
        disabled={disabled || !session.files.size || invalid}
        onClick={() => {
          if (dirty.length) editor.save.mutate({ paths, compile: true });
          else editor.compile.mutate();
        }}>
        {t(
          dirty.length
            ? "workbenchAuthoring.saveCompile"
            : "workbenchExplorer.compile",
        )}
      </Button>
      <Button
        size='icon'
        variant='ghost'
        disabled={disabled || !session.past.length}
        aria-label={t("particleColors.undo")}
        title={t("particleColors.undo")}
        onClick={() =>
          dispatch({
            type: "undo",
            label: t("particleColors.undo"),
            at: Date.now(),
          })
        }>
        <ArrowCounterClockwiseIcon />
      </Button>
      <Button
        size='icon'
        variant='ghost'
        disabled={disabled || !session.future.length}
        aria-label={t("particleColors.redo")}
        title={t("particleColors.redo")}
        onClick={() =>
          dispatch({
            type: "redo",
            label: t("particleColors.redo"),
            at: Date.now(),
          })
        }>
        <ArrowClockwiseIcon />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size='icon'
            variant='ghost'
            disabled={busy}
            aria-label={t("particleColors.moreActions")}>
            <DotsThreeIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            disabled={
              disabled ||
              !dirty.some((file) => file.path === selected) ||
              !!session.files.get(selected)?.diagnostic
            }
            onSelect={() =>
              editor.save.mutate({ paths: [selected], compile: false })
            }>
            {t("particleColors.saveFile")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!dirty.length && !blocked}
            onSelect={onDiscard}>
            {t("particleColors.discardAll")}
          </DropdownMenuItem>
          {editor.backup ? (
            <DropdownMenuItem
              disabled={disabled || dirty.length > 0}
              onSelect={() => editor.restore.mutate()}>
              {t("particleColors.restoreBackup")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <span
        role='status'
        className={`ml-auto text-xs ${dirty.length || proposalCount ? "font-medium text-primary" : "text-muted-foreground"}`}>
        {t(
          editor.compile.isPending
            ? "workbenchExplorer.compilingOnly"
            : editor.save.isPending
              ? "particleColors.saving"
              : proposalCount
                ? "particleColors.proposedChanges"
                : dirty.length
                  ? "particleColors.unsavedFiles"
                  : "particleColors.noUnsaved",
          { count: proposalCount || dirty.length },
        )}
      </span>
      <Button
        size='sm'
        variant={preview ? "secondary" : "ghost"}
        aria-pressed={preview}
        onClick={onPreview}>
        {t("workbenchExplorer.preview")}
      </Button>
    </div>
  );
}
