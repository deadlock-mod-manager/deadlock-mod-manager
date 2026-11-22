import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { PlayIcon, WaveformIcon } from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import type { FoundryEntry, FoundrySoundGroup } from "@/types/foundry";
import { chunkEntries } from "./foundry-chunks";
import { useFoundry } from "./foundry-context";
import { extensionOf, stageDroppedFile } from "./foundry-drop-zone";
import { useSoundPlayer } from "./use-foundry-sound-player";
import {
  sharedPrefix,
  SOUND_EXTENSIONS,
  KIND_ICONS,
  EAGER_WAVEFORM_LIMIT,
} from "./foundry-sound-utils";
import { GroupNav } from "./foundry-sound-group-nav";
import { ClipChunk } from "./foundry-sound-clip-chunk";
import { ClipInspector } from "./foundry-sound-clip-inspector";

/**
 * The sounds tab: groups on the left, the active group's clips in the middle,
 * the selected clip on the right. Clips play in place, and an edited clip can
 * be flipped against the original mid-playback.
 */
export const FoundrySoundsWorkspace = ({
  sidePanelClassName,
}: {
  sidePanelClassName: string;
}) => {
  const { t } = useTranslation();
  const {
    manifest,
    selectedEntryPath,
    setSelectedEntryPath,
    editedPaths,
    editRevision: revision,
    workspace,
    busy,
    replaceEntry,
  } = useFoundry();
  const player = useSoundPlayer();
  const groups = useMemo(() => manifest?.soundGroups ?? [], [manifest]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const groupOfPath = useMemo(() => {
    const map = new Map<string, FoundrySoundGroup>();
    for (const group of groups) {
      for (const entry of group.entries) map.set(entry.path, group);
    }
    return map;
  }, [groups]);
  const selectedGroup =
    selectedEntryPath !== null
      ? (groupOfPath.get(selectedEntryPath) ?? null)
      : null;
  const active =
    groups.find((group) => group.id === activeId) ??
    selectedGroup ??
    groups[0] ??
    null;
  const selectedEntry =
    selectedGroup?.entries.find((entry) => entry.path === selectedEntryPath) ??
    null;

  const prefix = useMemo(
    () =>
      active ? sharedPrefix(active.entries.map((entry) => entry.filename)) : "",
    [active],
  );
  const chunks = useMemo(
    () => (active ? chunkEntries(active.entries) : []),
    [active],
  );
  const replacedCount = active
    ? active.entries.filter((entry) => editedPaths.has(entry.path)).length
    : 0;

  const onSelect = useCallback(
    (entry: FoundryEntry) => setSelectedEntryPath(entry.path),
    [setSelectedEntryPath],
  );
  const onToggle = useCallback(
    (entry: FoundryEntry) => {
      setSelectedEntryPath(entry.path);
      player.toggle(entry.path);
    },
    [player, setSelectedEntryPath],
  );
  const onDropFile = useCallback(
    async (entry: FoundryEntry, file: File) => {
      if (!workspace || busy) return;
      if (!SOUND_EXTENSIONS.includes(extensionOf(file.name))) {
        toast.error(t("foundry.sounds.wrongFile"));
        return;
      }
      setSelectedEntryPath(entry.path);
      try {
        await replaceEntry(entry.path, await stageDroppedFile(file));
        toast.success(t("foundry.editor.replaced", { file: entry.filename }));
      } catch (err) {
        logger.withError(err).error("[Foundry] Replace failed");
        toast.error(t("foundry.editor.replaceFailed"));
      }
    },
    [busy, replaceEntry, setSelectedEntryPath, t, workspace],
  );

  if (!active) {
    return (
      <p className='flex-1 px-2 py-6 text-center text-muted-foreground text-sm'>
        {t("foundry.tabs.soundsEmpty")}
      </p>
    );
  }

  const ActiveIcon = KIND_ICONS[active.kind];

  return (
    <>
      <div className={cn(sidePanelClassName, "w-[220px] border-r")}>
        <GroupNav
          activeId={active.id}
          editedPaths={editedPaths}
          groups={groups}
          onSelect={setActiveId}
        />
      </div>
      <div className='flex min-w-0 flex-1 flex-col'>
        <div className='flex shrink-0 items-center gap-3 px-5 pt-[18px] pb-3.5'>
          <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary'>
            {active.slot !== null ? (
              <span className='font-mono font-semibold'>{active.slot}</span>
            ) : (
              <ActiveIcon className='h-5 w-5' />
            )}
          </span>
          <div className='min-w-0 flex-1'>
            <h2 className='truncate font-semibold text-base'>{active.label}</h2>
            <p className='truncate text-muted-foreground text-xs'>
              {[
                active.slot !== null
                  ? t("foundry.sounds.abilitySlot", { slot: active.slot })
                  : null,
                t("foundry.sounds.clipCount", { count: active.entries.length }),
                replacedCount > 0
                  ? t("foundry.sounds.replacedCount", { count: replacedCount })
                  : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
          <button
            className='flex shrink-0 items-center gap-[7px] rounded-[7px] border px-3 py-[7px] font-medium text-xs hover:bg-muted'
            onClick={() => player.playAll(active.entries)}
            type='button'>
            <PlayIcon className='h-[13px] w-[13px]' weight='fill' />
            {t("foundry.sounds.playAll")}
          </button>
        </div>
        <ScrollArea className='min-h-0 flex-1'>
          <div className='space-y-3.5 px-5 pb-5'>
            <div className='space-y-1'>
              {chunks.map((chunk) => (
                <ClipChunk
                  editedPaths={editedPaths}
                  eager={active.entries.length <= EAGER_WAVEFORM_LIMIT}
                  entries={chunk.entries}
                  key={chunk.entries[0].path}
                  onDropFile={onDropFile}
                  onSelect={onSelect}
                  onToggle={onToggle}
                  player={player}
                  prefix={prefix}
                  revision={revision}
                  selectedPath={selectedEntryPath}
                />
              ))}
            </div>
            <p className='flex items-center justify-center gap-2 rounded-lg border border-muted-foreground/30 px-3 py-4 text-muted-foreground text-xs'>
              <WaveformIcon className='h-4 w-4' />
              {t("foundry.sounds.dropHint")}
            </p>
          </div>
        </ScrollArea>
      </div>
      <div className={cn(sidePanelClassName, "w-[292px] border-l")}>
        <ClipInspector
          entry={selectedEntry}
          group={selectedGroup}
          player={player}
          revision={revision}
        />
      </div>
    </>
  );
};
