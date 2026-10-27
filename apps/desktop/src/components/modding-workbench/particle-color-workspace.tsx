import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";
import { ParticleColorPane } from "./particle-color-pane";
import { ParticleList } from "./particle-list";
import { ParticleRawEditor } from "./particle-raw-editor";
import { ParticleDraftPreview } from "./particle-draft-preview";
import {
  particleFolders,
  particleInFolder,
  selectParticleFile,
  type ParticleFileSelection,
} from "@/lib/particle-colors";
import { useParticleColorSession } from "./use-particle-color-session";

export function ParticleColorWorkspace({
  addon,
  files,
  initialPath,
  onDirtyChange,
  onSaved,
}: {
  addon: ModdingAddon;
  files: ModdingParticleFile[];
  initialPath?: string;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const editor = useParticleColorSession(addon.id, files, onSaved);
  const { session, dispatch, dirty, busy } = editor;
  const [selection, setSelection] = useState<ParticleFileSelection>(() => {
    const active =
      files.find((file) => file.path === initialPath)?.path ??
      files[0]?.path ??
      "";
    return { active, anchor: active, paths: new Set(active ? [active] : []) };
  });
  const selected = selection.active;
  const [folder, setFolder] = useState("");
  const [preview, setPreview] = useState(true);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"colors" | "shared" | "raw">("colors");
  const [raw, setRaw] = useState<{ path: string; text: string } | null>(null);
  const documents = [...session.files.values()];
  const selectedFiles = documents.filter((file) =>
    selection.paths.has(file.path),
  );
  const file = session.files.get(selected);
  const rawText = raw?.path === selected ? raw.text : (file?.text ?? "");
  const rawChanged = rawText !== (file?.text ?? "");
  const invalid = dirty.some((file) => !!file.diagnostic);
  useEffect(() => {
    onDirtyChange(dirty.length > 0 || rawChanged || busy);
  }, [dirty.length, rawChanged, busy, onDirtyChange]);
  const rows = documents
    .filter(
      (file) =>
        particleInFolder(file.path, folder) &&
        file.path.toLowerCase().includes(filter.toLowerCase()),
    )
    .map((file) => ({
      id: file.path,
      label: file.path.split("/").at(-1) ?? file.path,
      detail: file.diagnostic
        ? t("particleColors.invalidSource")
        : t("particleColors.fieldCount", { count: file.colors.length }),
      dirty: file.text !== session.baseline.get(file.path)?.text,
    }));
  const savePaths = dirty.map((file) => file.path);
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='flex shrink-0 flex-wrap items-center gap-2 border-b pb-3'>
        <Button
          size='sm'
          disabled={
            busy ||
            rawChanged ||
            !dirty.some((file) => file.path === selected) ||
            !!file?.diagnostic
          }
          onClick={() =>
            editor.save.mutate({ paths: [selected], compile: false })
          }>
          {t("particleColors.saveFile")}
        </Button>
        <Button
          size='sm'
          variant='outline'
          disabled={busy || rawChanged || !dirty.length || invalid}
          onClick={() =>
            editor.save.mutate({ paths: savePaths, compile: false })
          }>
          {t("particleColors.saveAll", { count: dirty.length })}
        </Button>
        <Button
          size='sm'
          variant='outline'
          disabled={busy || rawChanged || !documents.length || invalid}
          onClick={() => {
            if (dirty.length)
              editor.save.mutate({ paths: savePaths, compile: true });
            else editor.compile.mutate();
          }}>
          {t("workbenchAuthoring.saveCompile")}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          disabled={busy || rawChanged || !session.past.length}
          onClick={() =>
            dispatch({
              type: "undo",
              label: t("particleColors.undo"),
              at: Date.now(),
            })
          }>
          {t("particleColors.undo")}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          disabled={busy || rawChanged || !session.future.length}
          onClick={() =>
            dispatch({
              type: "redo",
              label: t("particleColors.redo"),
              at: Date.now(),
            })
          }>
          {t("particleColors.redo")}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          disabled={busy || (!dirty.length && !rawChanged)}
          onClick={() => {
            dispatch({ type: "reload", files: [...session.baseline.values()] });
            setRaw(null);
          }}>
          {t("particleColors.discardAll")}
        </Button>
        {editor.backup ? (
          <Button
            size='sm'
            variant='ghost'
            disabled={busy || rawChanged || dirty.length > 0}
            onClick={() => editor.restore.mutate()}>
            {t("particleColors.restoreBackup")}
          </Button>
        ) : null}
        <span role='status' className='ml-auto text-xs text-muted-foreground'>
          {t(
            editor.compile.isPending
              ? "workbenchExplorer.compilingOnly"
              : editor.save.isPending
                ? "particleColors.saving"
                : "particleColors.changedFiles",
            { count: dirty.length },
          )}
        </span>
        <Button
          size='sm'
          variant={preview ? "secondary" : "ghost"}
          aria-pressed={preview}
          onClick={() => setPreview(!preview)}>
          {t("particleColors.draftPreview")}
        </Button>
      </div>
      {editor.error ? (
        <p
          role='alert'
          className='shrink-0 border-b py-2 text-xs text-destructive'>
          {editor.error.message}
        </p>
      ) : null}
      {editor.compile.isSuccess && !dirty.length ? (
        <p role='status' className='shrink-0 border-b py-2 text-xs'>
          {t("workbenchExplorer.compiled")}
        </p>
      ) : null}
      {editor.backup ? (
        <p
          className='shrink-0 truncate py-1 text-[10px] text-muted-foreground'
          title={`${addon.contentPath}/.dmm-history/${editor.backup}`}>
          {t("particleColors.backup")} .dmm-history/{editor.backup}
        </p>
      ) : null}
      <div className='flex min-h-0 flex-1 flex-col pt-2 sm:flex-row'>
        <aside
          className='flex min-h-24 min-w-0 shrink-0 flex-col border-b sm:w-52 sm:border-b-0 sm:border-r'
          aria-label={t("particleColors.files")}>
          <select
            aria-label={t("particleColors.folder")}
            className='mb-2 mr-2 rounded border bg-background p-2 text-xs'
            value={folder}
            disabled={busy || rawChanged}
            onChange={(event) => {
              const folder = event.target.value;
              setFolder(folder);
              setFilter("");
              const paths = documents
                .filter((file) => particleInFolder(file.path, folder))
                .map((file) => file.path);
              const active = paths[0] ?? "";
              setSelection({ active, anchor: active, paths: new Set(paths) });
              setTab("shared");
            }}>
            <option value=''>{t("particleColors.allFolders")}</option>
            {particleFolders(documents).map((folder) => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
          </select>
          <Input
            className='mb-2 w-[calc(100%-0.5rem)] shrink-0 text-xs'
            aria-label={t("particleColors.filterFiles")}
            placeholder={t("particleColors.filterFiles")}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <div className='mr-2 space-y-1 border-b pb-2'>
            <div className='flex items-center justify-between text-xs'>
              <span role='status'>
                {t("particleColors.selectedFiles", {
                  count: selection.paths.size,
                })}
              </span>
              <Button
                size='sm'
                variant='ghost'
                disabled={busy || rawChanged || !rows.length}
                onClick={() => {
                  const active = rows[0]?.id ?? "";
                  setSelection({
                    active,
                    anchor: active,
                    paths: new Set(rows.map((row) => row.id)),
                  });
                  setTab("shared");
                }}>
                {t("particleColors.selectVisible")}
              </Button>
            </div>
            <p className='text-[10px] text-muted-foreground'>
              {t("particleColors.selectionHint")}
            </p>
          </div>
          <ParticleList
            items={rows}
            active={selected}
            disabled={busy || rawChanged}
            label={t("particleColors.files")}
            selection={selection.paths}
            onSelect={(path, event) => {
              const next = selectParticleFile(
                selection,
                path,
                rows.map((row) => row.id),
                event,
              );
              setSelection(next);
              if (next.paths.size > 1) setTab("shared");
            }}
          />
        </aside>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          <p
            className='shrink-0 truncate border-b px-3 py-1 font-mono text-[11px]'
            title={file?.path}>
            {file?.path}
          </p>
          <div className='flex shrink-0 gap-1 border-b p-2'>
            {(["colors", "shared", "raw"] satisfies (typeof tab)[]).map(
              (value) => (
                <Button
                  key={value}
                  size='sm'
                  variant={tab === value ? "secondary" : "ghost"}
                  disabled={busy || rawChanged}
                  onClick={() => setTab(value)}>
                  {t(`particleColors.${value}`)}
                </Button>
              ),
            )}
          </div>
          {file?.diagnostic ? (
            <p role='alert' className='shrink-0 p-2 text-xs text-destructive'>
              {file.diagnostic}
            </p>
          ) : null}
          {tab === "raw" && file ? (
            <ParticleRawEditor
              file={file}
              files={selectedFiles}
              busy={busy}
              raw={rawText}
              onRaw={(text) => setRaw({ path: selected, text })}
              onApply={(edits, label) =>
                editor.edit.mutate(
                  { edits, label },
                  { onSuccess: () => setRaw(null) },
                )
              }
            />
          ) : (
            <ParticleColorPane
              key={`${tab}:${selected}`}
              file={file}
              files={selectedFiles}
              busy={busy}
              shared={tab === "shared"}
              onEdit={(edits, label) => editor.edit.mutate({ edits, label })}
            />
          )}
        </div>
        {preview ? (
          <ParticleDraftPreview
            addon={addon}
            file={file}
            dirty={dirty}
            rawChanged={rawChanged}
          />
        ) : null}
      </div>
      <details className='shrink-0 border-t text-xs'>
        <summary className='cursor-pointer py-2'>
          {t("particleColors.history")} ({session.log.length})
        </summary>
        <ol className='max-h-28 overflow-auto space-y-1 pb-2'>
          {session.log.map((entry) => (
            <li key={entry.id} className='flex gap-2'>
              <time
                className='shrink-0 text-muted-foreground'
                dateTime={new Date(entry.at).toISOString()}>
                {new Date(entry.at).toLocaleTimeString()}
              </time>
              <span>
                {entry.label} ·{" "}
                {t("particleColors.changedFiles", { count: entry.count })}
              </span>
            </li>
          ))}
        </ol>
      </details>
      <p className='shrink-0 border-t pt-2 text-[10px] text-muted-foreground'>
        {t("particleColors.previewHint")} · {t("particleColors.credit")}
      </p>
    </div>
  );
}
