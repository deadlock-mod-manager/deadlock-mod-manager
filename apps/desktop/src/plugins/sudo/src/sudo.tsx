import { Button } from "@deadlock-mods/ui/components/button";
import { Card } from "@deadlock-mods/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deadlock-mods/ui/components/form";
import { Input } from "@deadlock-mods/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import ModMetadataForm, {
  type ModMetadata,
} from "@/components/mod-creation/mod-metadata-form";
import { useDownload } from "@/hooks/use-download";
import { useFileDrop } from "@/hooks/use-file-drop";
import useInstall from "@/hooks/use-install";
import { useModProcessor } from "@/hooks/use-mod-processor";
import { getModDownloads, getMods } from "@/lib/api";
import { ModCategory } from "@/lib/constants";
import { ACCEPTED_FILE_TYPES } from "@/lib/file-patterns";
import { type DetectedSource, getFileName } from "@/lib/file-utils";
import { usePersistedStore } from "@/lib/store";
import { type AddModFormValues, addModSchema } from "@/types/add-mods";
import { type LocalMod, type ModDownloadItem, ModStatus } from "@/types/mods";
import { ActiveRow } from "./active-row";
import { StoreRow } from "./store-row";

const SudoPage = () => {
  const { t } = useTranslation();
  const {
    data: mods,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["mods"],
    queryFn: getMods,
    retry: 2,
  });

  const { localMods } = usePersistedStore();

  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const list = mods ?? [];
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter((m) => {
      const desc = m.description ?? "";
      return (
        m.name.toLowerCase().includes(q) ||
        m.author.toLowerCase().includes(q) ||
        desc.toLowerCase().includes(q)
      );
    });
  }, [mods, query]);

  const leftList = filtered;
  const rightList = useMemo(() => localMods, [localMods]);

  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);

  const selectedRemote = useMemo(
    () => leftList.find((m) => m.remoteId === selectedStoreId),
    [leftList, selectedStoreId],
  );
  const selectedLocal = useMemo(
    () => rightList.find((m) => m.remoteId === selectedLocalId),
    [rightList, selectedLocalId],
  );

  const { data: downloadsData } = useQuery({
    queryKey: ["sudo-downloads", selectedStoreId],
    queryFn: () => getModDownloads(selectedStoreId as string),
    enabled: !!selectedStoreId,
  });
  const availableFiles = (downloadsData?.downloads ??
    []) as unknown as ModDownloadItem[];

  const { download, downloadSelectedFiles } = useDownload(
    selectedRemote,
    availableFiles,
  );
  const { install } = useInstall();
  const [pendingInstall, setPendingInstall] = useState(false);
  const { processMod } = useModProcessor();
  const [importOpen, setImportOpen] = useState(false);
  const [detected, setDetected] = useState<DetectedSource | null>(null);

  const form = useForm<AddModFormValues>({
    resolver: zodResolver(addModSchema),
    defaultValues: { category: ModCategory.SKINS, sourceType: "vpk" },
  });

  const { onFileSelect } = useFileDrop(
    async (source) => {
      setDetected(source);
      form.reset({ category: ModCategory.SKINS, sourceType: source.kind });
      setImportOpen(true);
    },
    (message) => toast.error(message),
  );

  // Track the selected mod from local store to react to status changes
  const selectedLocalModFromStore = usePersistedStore((s) =>
    s.localMods.find((m) => m.remoteId === selectedStoreId),
  );

  useEffect(() => {
    if (!pendingInstall || !selectedLocalModFromStore) return;
    if (selectedLocalModFromStore.status === ModStatus.Downloaded) {
      void install(selectedLocalModFromStore, {
        onStart: (m) =>
          usePersistedStore
            .getState()
            .setModStatus(m.remoteId, ModStatus.Installing),
        onComplete: (m, result) => {
          const s = usePersistedStore.getState();
          s.setModStatus(m.remoteId, ModStatus.Installed);
          s.setInstalledVpks(
            m.remoteId,
            result.installed_vpks,
            result.file_tree,
          );
          s.setModEnabledInCurrentProfile(m.remoteId, true);
          setPendingInstall(false);
          // Focus newly installed mod on the right
          setSelectedLocalId(m.remoteId);
        },
        onError: (m) => {
          usePersistedStore
            .getState()
            .setModStatus(m.remoteId, ModStatus.Error);
          setPendingInstall(false);
        },
      });
    }
  }, [pendingInstall, selectedLocalModFromStore, install]);

  const handleMoveRight = async () => {
    if (!selectedRemote) return;
    const store = usePersistedStore.getState();
    if (!store.localMods.find((m) => m.remoteId === selectedRemote.remoteId)) {
      store.addLocalMod(selectedRemote);
    }
    const files = availableFiles;
    if (files && files.length > 0) {
      await downloadSelectedFiles(files);
    } else {
      await download();
    }
    setPendingInstall(true);
  };

  const handleMoveLeft = async () => {
    if (!selectedLocal) return;
    const s = usePersistedStore.getState();
    try {
      if (selectedLocal.status === ModStatus.Installed) {
        const activeProfile = s.getActiveProfile();
        const profileFolder = activeProfile?.folderName ?? null;

        await (
          await import("@tauri-apps/api/core")
        ).invoke("purge_mod", {
          modId: selectedLocal.remoteId,
          vpks: selectedLocal.installedVpks ?? [],
          profileFolder,
        });
      }
    } catch {}
    s.removeMod(selectedLocal.remoteId);
  };

  return (
    <div className='scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin w-full overflow-y-auto overflow-x-hidden px-4'>
      <div className='mb-2 flex items-center justify-between'>
        <h2 className='text-xl font-semibold'>{t("plugins.sudo.title")}</h2>
      </div>
      <p className='mb-4 text-sm text-muted-foreground'>
        {t("plugins.sudo.instructions")}
      </p>

      <div className='mb-4 flex w-full items-center justify-end gap-2'>
        <Button
          variant='outline'
          onClick={async () => {
            try {
              const { invoke } = await import("@tauri-apps/api/core");
              const { usePersistedStore } = await import("@/lib/store");
              const activeProfile = usePersistedStore
                .getState()
                .getActiveProfile();
              const profileFolder = activeProfile?.folderName ?? null;
              await invoke("open_mods_folder", { profileFolder });
            } catch {}
          }}>
          {t("plugins.sudo.openAddons")}
        </Button>
        <Button
          variant='default'
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.multiple = true;
            input.accept = ACCEPTED_FILE_TYPES;
            input.onchange = (e) =>
              onFileSelect(e as unknown as React.ChangeEvent<HTMLInputElement>);
            input.click();
          }}>
          {t("plugins.sudo.importMod")}
        </Button>
      </div>

      <div className='mt-2 md:mt-4 flex gap-4'>
        <Card className='flex-1 p-3'>
          <div className='mb-2 flex items-center justify-between'>
            <span className='font-medium'>{t("navigation.getMods")}</span>
            <Input
              placeholder={t("mods.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className='max-w-xs'
            />
          </div>
          <div className='scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin h-[520px] overflow-auto rounded border'>
            <ul className='divide-y'>
              {(isLoading ? [] : leftList).slice(0, 200).map((m) => (
                <StoreRow
                  key={m.remoteId}
                  mod={m}
                  isSelected={selectedStoreId === m.remoteId}
                  onSelect={setSelectedStoreId}
                />
              ))}
              {error ? (
                <li className='p-2 text-sm text-muted-foreground'>
                  {t("common.failedToFetchMods")}
                </li>
              ) : null}
            </ul>
          </div>
        </Card>

        <div className='flex items-center'>
          <div className='flex flex-col gap-3'>
            <Button
              size='icon'
              variant='outline'
              onClick={handleMoveRight}
              disabled={!selectedRemote}
              title='Activate selected mod'>
              ➜
            </Button>
            <Button
              size='icon'
              variant='outline'
              onClick={handleMoveLeft}
              disabled={!selectedLocal}
              title='Remove selected mod'>
              ←
            </Button>
          </div>
        </div>

        <Card className='flex-1 p-3'>
          <div className='mb-2 flex items-center justify-between'>
            <span className='font-medium'>{t("navigation.myMods")}</span>
            <Input
              placeholder={t("mods.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className='max-w-xs'
            />
          </div>
          <div className='scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin h-[520px] overflow-auto rounded border'>
            <ul className='divide-y'>
              {rightList
                .filter((m) =>
                  query
                    ? m.name.toLowerCase().includes(query.toLowerCase()) ||
                      (m.author?.toLowerCase?.() || "").includes(
                        query.toLowerCase(),
                      )
                    : true,
                )
                .slice(0, 200)
                .map((m: LocalMod) => (
                  <ActiveRow
                    key={m.remoteId}
                    mod={m}
                    isSelected={selectedLocalId === m.remoteId}
                    onSelect={setSelectedLocalId}
                  />
                ))}
            </ul>
          </div>
        </Card>
      </div>

      <Dialog onOpenChange={setImportOpen} open={importOpen}>
        <DialogContent className='max-w-4xl'>
          <DialogHeader>
            <DialogTitle>{t("addMods.finalizeTitle")}</DialogTitle>
            <DialogDescription>
              {t("addMods.finalizeDescription")}
            </DialogDescription>
          </DialogHeader>

          <ModMetadataForm
            hideCardChrome
            initial={{
              name: detected?.file?.name?.replace(/\.[^.]+$/, "") || "",
            }}
          />

          <div className='mt-4 space-y-4'>
            <Form {...form}>
              <form onSubmit={(e) => e.preventDefault()}>
                <FormField
                  control={form.control}
                  name='category'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("addMods.category")}</FormLabel>
                      <Select
                        defaultValue={field.value}
                        onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t("addMods.selectCategory")}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(ModCategory).map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>

            <div className='rounded-md bg-muted p-3 text-xs'>
              {form.getValues("sourceType") === "archive" &&
              detected?.kind === "archive" ? (
                <div>
                  <span className='font-medium'>{t("addMods.source")}:</span>{" "}
                  Archive → {detected.file.name}
                </div>
              ) : detected?.kind === "vpk" ? (
                <div>
                  <span className='font-medium'>{t("addMods.source")}:</span>{" "}
                  VPK → {getFileName(detected.file)}
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className='mt-2'>
            <Button
              onClick={() => setImportOpen(false)}
              type='button'
              variant='ghost'>
              {t("addMods.cancel")}
            </Button>
            <Button
              onClick={async () => {
                try {
                  if (!detected) {
                    toast.error(t("addMods.noFilesDetected"));
                    return;
                  }
                  const category = form.getValues("category");
                  await processMod(
                    {
                      name: detected.file.name.replace(/\.[^.]+$/, ""),
                    } as ModMetadata,
                    category,
                    detected,
                  );
                  setImportOpen(false);
                } catch (e) {
                  toast.error(t("addMods.processingError"));
                }
              }}
              type='button'>
              {t("addMods.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SudoPage;
