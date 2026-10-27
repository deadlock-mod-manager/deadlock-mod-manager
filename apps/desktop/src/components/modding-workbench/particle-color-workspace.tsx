import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  emptyParticleColorDraft,
  initialParticleSelection,
  particleFolders,
  particleInFolder,
  particleHex,
  particleRgb,
  planParticleColors,
  selectParticleFile,
  selectParticleFolder,
  sharedParticleColors,
} from "@/lib/particle-colors";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";
import { ParticleColorPane } from "./particle-color-pane";
import { ParticleList } from "./particle-list";
import { ParticleRawEditor } from "./particle-raw-editor";
import { ParticleDraftPreview } from "./particle-draft-preview";
import { ParticleEditorToolbar } from "./particle-editor-toolbar";
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
  const [selection, setSelection] = useState(() =>
    initialParticleSelection(files, initialPath),
  );
  const [folder, setFolder] = useState("");
  const [preview, setPreview] = useState(true);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState(false);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"colors" | "shared" | "raw">(
    initialPath ? "colors" : "shared",
  );
  const [raw, setRaw] = useState<{ path: string; text: string } | null>(null);
  const [draft, setDraft] = useState(emptyParticleColorDraft);
  const selected = selection.active;
  const documents = useMemo(() => [...session.files.values()], [session.files]);
  const selectedFiles = useMemo(
    () => documents.filter((file) => selection.paths.has(file.path)),
    [documents, selection.paths],
  );
  const file = session.files.get(selected);
  const groups = useMemo(
    () => sharedParticleColors(selectedFiles, draft.threshold),
    [selectedFiles, draft.threshold],
  );
  const plan = useMemo(() => {
    const rgb = particleRgb(draft.hex);
    if (!rgb || tab === "raw") return { edits: [], files: [], fields: 0 };
    if (tab === "shared") {
      if (draft.all) return planParticleColors(selectedFiles, rgb);
      const group = groups.find((group) => group.hex === draft.selection);
      return planParticleColors(
        selectedFiles,
        rgb,
        (group?.fields ?? []).map(({ file, color }) => ({
          file,
          path: color.path,
        })),
      );
    }
    return planParticleColors(
      file ? [file] : [],
      rgb,
      draft.selection && file
        ? [{ file: file.path, path: draft.selection }]
        : [],
    );
  }, [draft.hex, draft.all, draft.selection, file, selectedFiles, groups, tab]);
  const debounced = useDebouncedValue(plan.edits, 180);
  const proposed = useQuery({
    queryKey: ["workbench-particle-proposal", addon.id, debounced],
    queryFn: () =>
      invoke<ModdingParticleFile[]>("edit_modding_particle_colors", {
        files: debounced,
      }),
    enabled: debounced.length > 0,
    retry: false,
    gcTime: 0,
    meta: { skipGlobalErrorHandler: true },
  });
  const previewFiles = plan.edits === debounced ? (proposed.data ?? []) : [];
  const pending = plan.edits.length > 0;
  const rawText = raw?.path === selected ? raw.text : (file?.text ?? "");
  const rawChanged = rawText !== (file?.text ?? "");
  const blocked = rawChanged || pending || picking;
  useEffect(() => {
    onDirtyChange(dirty.length > 0 || blocked || busy);
  }, [dirty.length, blocked, busy, onDirtyChange]);
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
  const resetProposal = () => {
    setDraft(emptyParticleColorDraft());
    setPicking(false);
    setPickError(false);
  };
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <ParticleEditorToolbar
        editor={editor}
        selected={selected}
        blocked={blocked}
        proposalCount={plan.files.length}
        preview={preview}
        onPreview={() => {
          setPreview(!preview);
          setPicking(false);
        }}
        onDiscard={() => {
          dispatch({ type: "reload", files: [...session.baseline.values()] });
          setRaw(null);
          resetProposal();
        }}
      />
      {editor.error ? (
        <p
          role='alert'
          className='shrink-0 border-b py-2 text-xs text-destructive'>
          {editor.error.message}
        </p>
      ) : null}
      {proposed.error && pending ? (
        <p
          role='alert'
          className='shrink-0 border-b py-2 text-xs text-destructive'>
          {String(proposed.error)}
        </p>
      ) : null}
      <div className='flex min-h-0 flex-1 flex-col pt-2 sm:flex-row'>
        <aside
          className='flex min-h-24 min-w-0 shrink-0 flex-col border-b sm:w-48 sm:border-b-0 sm:border-r'
          aria-label={t("particleColors.files")}>
          <select
            aria-label={t("particleColors.folder")}
            className='mb-2 mr-2 rounded border bg-background p-2 text-xs'
            value={folder}
            disabled={busy || blocked}
            onChange={(event) => {
              const folder = event.target.value;
              setFolder(folder);
              setFilter("");
              setSelection(selectParticleFolder(documents, folder));
              setTab("shared");
              resetProposal();
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
          <div className='mr-2 flex items-center justify-between border-b pb-2 text-xs'>
            <span role='status'>
              {t("particleColors.selectedFiles", {
                count: selection.paths.size,
              })}
            </span>
            <Button
              size='sm'
              variant='ghost'
              disabled={busy || blocked || !rows.length}
              onClick={() => {
                const active = rows[0]?.id ?? "";
                setSelection({
                  active,
                  anchor: active,
                  paths: new Set(rows.map((row) => row.id)),
                });
                setTab("shared");
                resetProposal();
              }}>
              {t("particleColors.selectVisible")}
            </Button>
          </div>
          <ParticleList
            items={rows}
            active={selected}
            disabled={busy || blocked}
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
              resetProposal();
              if (next.paths.size > 1) setTab("shared");
            }}
          />
          <details className='shrink-0 border-t p-2 text-[10px] text-muted-foreground'>
            <summary className='cursor-pointer'>
              {t("particleColors.selectionHelp")}
            </summary>
            <p className='pt-1'>{t("particleColors.selectionHint")}</p>
          </details>
        </aside>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          <div className='flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-2 py-1'>
            <div className='flex gap-1'>
              {(["colors", "shared", "raw"] satisfies (typeof tab)[]).map(
                (value) => (
                  <Button
                    key={value}
                    size='sm'
                    variant={tab === value ? "secondary" : "ghost"}
                    disabled={busy || blocked}
                    onClick={() => {
                      setTab(value);
                      resetProposal();
                    }}>
                    {t(`particleColors.${value}`)}
                  </Button>
                ),
              )}
            </div>
            <span
              className='min-w-0 truncate text-[11px] text-muted-foreground'
              title={file?.path}>
              {tab !== "shared" ? file?.path.split("/").at(-1) : null}
            </span>
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
              file={file}
              files={selectedFiles}
              busy={busy}
              shared={tab === "shared"}
              draft={draft}
              groups={groups}
              plan={plan}
              onDraft={(next) => {
                setDraft(next);
                const group =
                  tab === "shared"
                    ? groups.find((group) => group.hex === next.selection)
                    : undefined;
                const active =
                  group && !group.files.includes(selected)
                    ? group.files[0]
                    : undefined;
                if (active)
                  setSelection((selection) => ({ ...selection, active }));
              }}
              onApply={() =>
                editor.edit.mutate(
                  {
                    edits: plan.edits,
                    label: t(
                      draft.all
                        ? "particleColors.allRecolored"
                        : "particleColors.sharedApplied",
                      {
                        count: plan.files.length,
                        color: draft.selection,
                        replacement: draft.hex,
                      },
                    ),
                  },
                  {
                    onSuccess: () => {
                      setDraft((draft) => {
                        const rgb = particleRgb(draft.hex);
                        return {
                          ...draft,
                          all: false,
                          selection:
                            tab === "shared" && rgb
                              ? particleHex(rgb)
                              : draft.selection,
                        };
                      });
                    },
                  },
                )
              }
              onPickPreview={() => {
                setPreview(true);
                setPickError(false);
                setPicking(true);
              }}
            />
          )}
        </div>
        {preview ? (
          <ParticleDraftPreview
            addon={addon}
            file={file}
            dirty={dirty}
            rawChanged={rawChanged}
            proposed={previewFiles}
            picking={picking}
            pickError={pickError}
            onColorPicked={(hex) => {
              setDraft((draft) => ({ ...draft, hex }));
              setPicking(false);
              setPickError(false);
            }}
            onCancelPick={() => {
              setPicking(false);
              setPickError(false);
            }}
            onPickError={() => setPickError(true)}
          />
        ) : null}
      </div>
      <details className='shrink-0 border-t text-xs'>
        <summary className='cursor-pointer py-2'>
          {t("particleColors.history")} ({session.log.length})
        </summary>
        <ol className='max-h-28 space-y-1 overflow-auto pb-2'>
          {session.log.map((entry) => (
            <li key={entry.id}>
              <time
                className='mr-2 text-muted-foreground'
                dateTime={new Date(entry.at).toISOString()}>
                {new Date(entry.at).toLocaleTimeString()}
              </time>
              {entry.label} ·{" "}
              {t("particleColors.changedFiles", { count: entry.count })}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
