import { zodResolver } from '@hookform/resolvers/zod';
import { UploadSimple } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  writeFile,
} from '@tauri-apps/plugin-fs';
import JSZip from 'jszip';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import ModMetadataForm, {
  type ModMetadata,
  type ModMetadataFormHandle,
} from '@/components/mod-metadata-form';
import PageTitle from '@/components/page-title';
import {
  ProgressIndicator,
  useProgress,
} from '@/components/progress-indicator';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MOD_CATEGORY_ORDER, ModCategory } from '@/lib/constants';
import { usePersistedStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ModStatus } from '@/types/mods';

type DetectedSource =
  | { kind: 'archive'; file: File }
  | { kind: 'vpk'; file: File };

const fileName = (file: File) => (file as any).webkitRelativePath || file.name;
const toBytes = async (f: File) => new Uint8Array(await f.arrayBuffer());
const ensureDir = async (abs: string) => {
  if (!(await exists(abs, { baseDir: BaseDirectory.AppLocalData })))
    await mkdir(abs, { recursive: true, baseDir: BaseDirectory.AppLocalData });
};
const writeBytes = async (abs: string, data: Uint8Array) =>
  writeFile(abs, data, { baseDir: BaseDirectory.AppLocalData });
const writeText = async (abs: string, text: string) =>
  writeFile(abs, new TextEncoder().encode(text), {
    baseDir: BaseDirectory.AppLocalData,
  });
const fileToDataUrl = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error('read fail'));
    r.onload = () => res(String(r.result));
    r.readAsDataURL(f);
  });

const detectSource = (files: File[]): DetectedSource | null => {
  if (!files?.length) return null;
  const flat = files.filter(Boolean);
  const vpk = flat.find((f) => /\.vpk$/i.test(f.name));
  if (flat.length === 1 && vpk) return { kind: 'vpk', file: vpk };
  const archive = flat.find((f) => /\.(zip|rar|7z)$/i.test(f.name));
  if (flat.length === 1 && archive) return { kind: 'archive', file: archive };
  return null;
};

const readFromDataTransferItems = async (
  items: DataTransferItemList
): Promise<File[]> => {
  const promises: Promise<File[]>[] = [];
  const toFiles = async (entry: any, path = ''): Promise<File[]> => {
    if (!entry) return [];
    if (entry.isFile) {
      return new Promise<File[]>((resolve) => {
        entry.file((file: File) => {
          (file as any).webkitRelativePath = path + file.name;
          resolve([file]);
        });
      });
    }
    if (entry.isDirectory) {
      const dirReader = entry.createReader();
      return new Promise<File[]>((resolve) => {
        const entries: any[] = [];
        const readEntries = () => {
          dirReader.readEntries(async (batch: any[]) => {
            if (batch.length) {
              entries.push(...batch);
              readEntries();
            } else {
              const nested = await Promise.all(
                entries.map((e) => toFiles(e, path + entry.name + '/'))
              );
              resolve(nested.flat());
            }
          });
        };
        readEntries();
      });
    }
    return [];
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (entry) promises.push(toFiles(entry));
    else if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) promises.push(Promise.resolve([file]));
    }
  }
  const arrays = await Promise.all(promises);
  return arrays.flat();
};

const addModSchema = z.object({
  category: z.nativeEnum(ModCategory),
  sourceType: z.enum(['archive', 'vpk']),
});
type AddModValues = z.infer<typeof addModSchema>;

const AddMods = () => {
  const { t } = useTranslation();
  const { setProcessing, isProcessing } = useProgress();
  const [open, setOpen] = useState(false);
  const [detected, setDetected] = useState<DetectedSource | null>(null);
  const [dragging, setDragging] = useState(false);
  const [initialMeta, setInitialMeta] = useState<
    Partial<ModMetadata> | undefined
  >(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const metaRef = useRef<ModMetadataFormHandle>(null);

  const { addMod, setModPath, setModStatus } = usePersistedStore();

  const form = useForm<AddModValues>({
    resolver: zodResolver(addModSchema),
    defaultValues: { category: ModCategory.SKINS, sourceType: 'vpk' },
  });

  useEffect(() => {
    const prevent = (e: Event) => {
      e.preventDefault();
    };
    window.addEventListener('dragenter', prevent as any, { passive: false });
    window.addEventListener('dragover', prevent as any, { passive: false });
    window.addEventListener('drop', prevent as any, { passive: false });
    return () => {
      window.removeEventListener('dragenter', prevent as any);
      window.removeEventListener('dragover', prevent as any);
      window.removeEventListener('drop', prevent as any);
    };
  }, []);

  const startDialog = (ds: DetectedSource) => {
    const n =
      ds.kind === 'archive'
        ? ds.file.name.replace(/\.(zip|rar|7z)$/i, '')
        : ds.file.name.replace(/\.vpk$/i, '');
    setDetected(ds);
    form.reset({ category: ModCategory.SKINS, sourceType: ds.kind });
    setInitialMeta({ name: n || '' });
    setOpen(true);
  };

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const ds = detectSource(files);
    if (!ds) {
      toast.error(t('addMods.unsupportedSelection'));
      return;
    }
    startDialog(ds);
  };

  const finalize = async () => {
    setProcessing(true, t('addMods.validatingMetadata'));

    const meta = await metaRef.current?.validateAndGet();
    if (!meta) {
      setProcessing(false);
      return;
    }
    const category = form.getValues('category');

    if (!detected) {
      toast.error(t('addMods.noFilesDetected'));
      setProcessing(false);
      return;
    }

    const modId = `local-${crypto.randomUUID()}`;
    const base = await appLocalDataDir();
    const modsRoot = await join(base, 'mods');
    const modDir = await join(modsRoot, modId);
    const filesDir = await join(modDir, 'files');

    setProcessing(true, t('addMods.creatingDirectories'));
    await ensureDir(modsRoot);
    await ensureDir(modDir);
    await ensureDir(filesDir);

    setProcessing(true, t('addMods.processingPreview'));
    let previewName = 'preview.svg';
    if (meta.imageFile) {
      const extMatch = meta.imageFile.name.match(
        /\.(png|jpe?g|webp|gif|svg)$/i
      );
      previewName = `preview${extMatch ? extMatch[0].toLowerCase() : '.png'}`;
      await writeBytes(
        await join(modDir, previewName),
        await toBytes(meta.imageFile)
      );
    } else {
      const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#1f2937" offset="0"/><stop stop-color="#111827" offset="1"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><g font-family="Inter, Arial, sans-serif" fill="#E5E7EB" text-anchor="middle"><text x="50%" y="48%" font-size="36" font-weight="700">MOD</text><text x="50%" y="62%" font-size="14" fill="#9CA3AF">No image provided</text></g></svg>`;
      await writeText(await join(modDir, previewName), FALLBACK_SVG);
    }

    setProcessing(true, t('addMods.processingFiles'));

    try {
      if (detected.kind === 'vpk') {
        console.log('Processing VPK file:', detected.file.name);
        await writeBytes(
          await join(filesDir, detected.file.name),
          await toBytes(detected.file)
        );
        console.log('VPK file written to files directory');
      } else if (detected.kind === 'archive') {
        const name = detected.file.name.toLowerCase();
        if (name.endsWith('.zip')) {
          console.log('Processing ZIP archive:', detected.file.name);
          const zip = await JSZip.loadAsync(await detected.file.arrayBuffer());
          const entry = Object.values(zip.files).find(
            (f) => !f.dir && /\.vpk$/i.test(f.name)
          );
          if (entry) {
            console.log('Found VPK in ZIP:', entry.name);
            const buf = await entry.async('uint8array');
            const baseName = entry.name.split('/').pop() || 'mod.vpk';
            await writeBytes(await join(filesDir, baseName), buf);
            console.log('VPK extracted to files directory:', baseName);
          } else {
            console.log('No VPK found in ZIP, storing archive');
            await writeBytes(
              await join(modDir, detected.file.name),
              await toBytes(detected.file)
            );
            toast.error(t('addMods.noVpkFound'));
          }
        } else if (name.endsWith('.rar') || name.endsWith('.7z')) {
          // Store archive and extract it immediately
          console.log('Storing and extracting archive:', detected.file.name);
          setProcessing(
            true,
            t('addMods.storingArchive', {
              format: name.split('.').pop()?.toUpperCase(),
            })
          );
          await writeBytes(
            await join(modDir, detected.file.name),
            await toBytes(detected.file)
          );

          // Extract archive using backend
          try {
            setProcessing(
              true,
              t('addMods.extractingArchive', {
                format: name.split('.').pop()?.toUpperCase(),
              })
            );
            const archivePath = await join(modDir, detected.file.name);
            const extractedVpks = await invoke('extract_archive', {
              archivePath: await archivePath,
              targetPath: await filesDir,
            });

            console.log('Extracted VPK files:', extractedVpks);
            toast.success(
              t('addMods.archiveExtractedSuccess', {
                format: name.split('.').pop()?.toUpperCase(),
              })
            );
          } catch (error) {
            console.error('Failed to extract archive:', error);
            toast.error(t('addMods.failedToExtractArchive'));
          }
        } else {
          await writeBytes(
            await join(modDir, detected.file.name),
            await toBytes(detected.file)
          );
        }
      }
    } catch (e) {
      console.error(e);
      toast.error(t('addMods.failedToProcessArchive'));
      if ('file' in detected) {
        await writeBytes(
          await join(modDir, detected.file.name),
          await toBytes(detected.file as File)
        );
      }
    }

    setProcessing(true, t('addMods.validatingFiles'));

    // Validate that we have VPK files or archives that will be processed during installation
    const filesList = await readDir(filesDir, {
      baseDir: BaseDirectory.AppLocalData,
    });
    const hasVpk = filesList.some((e) => /\.vpk$/i.test(e.name || ''));

    console.log(
      'Files in files directory:',
      filesList.map((f) => f.name)
    );
    console.log('Has VPK files:', hasVpk);

    if (hasVpk) {
      console.log('VPK files found, proceeding with mod creation');
    } else if (detected.kind === 'archive') {
      const name = detected.file.name.toLowerCase();
      if (name.endsWith('.rar') || name.endsWith('.7z')) {
        // RAR/7ZIP archives are stored and will be processed during installation
        console.log('RAR/7ZIP archive will be processed during installation');
        toast.info(t('addMods.archiveWillBeProcessed'));
      } else {
        // For other archives, store them as fallback
        console.log('Storing archive as fallback');
        await writeBytes(
          await join(modDir, detected.file.name),
          await toBytes(detected.file)
        );
        toast.warning(t('addMods.noVpkFoundStored'));
      }
    } else {
      console.error('No VPK files found in the uploaded content');
      toast.error(t('addMods.noVpkFoundInContent'));
      setProcessing(false);
      return;
    }

    setProcessing(true, t('addMods.savingMetadata'));

    const metadata = {
      id: modId,
      kind: 'local',
      name: meta.name,
      author: meta.author || 'Unknown',
      link: meta.link || null,
      description: meta.description || null,
      category,
      createdAt: new Date().toISOString(),
      preview: previewName,
      _schema: 1,
    };
    await writeText(
      await join(modDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    setProcessing(true, t('addMods.processingImage'));

    const imageDataUrl = meta.imageFile
      ? await fileToDataUrl(meta.imageFile)
      : 'data:image/svg+xml;utf8,' +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#1f2937" offset="0"/><stop stop-color="#111827" offset="1"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><g font-family="Inter, Arial, sans-serif" fill="#E5E7EB" text-anchor="middle"><text x="50%" y="48%" font-size="36" font-weight="700">MOD</text><text x="50%" y="62%" font-size="14" fill="#9CA3AF">No image provided</text></g></svg>`
        );

    setProcessing(true, t('addMods.addingToLibrary'));

    const modDto: any = {
      id: modId,
      remoteId: modId,
      name: metadata.name,
      description: metadata.description ?? '',
      remoteUrl: metadata.link ?? 'local://manual',
      author: metadata.author,
      downloadable: false,
      remoteAddedAt: metadata.createdAt,
      remoteUpdatedAt: metadata.createdAt,
      tags: [],
      images: [imageDataUrl],
      hero: null,
      downloadCount: 0,
      likes: 0,
      category,
    };

    addMod(modDto, { path: modDir, status: ModStatus.DOWNLOADED });
    setModPath(modId, modDir);
    setModStatus(modId, ModStatus.DOWNLOADED);

    setProcessing(true, t('addMods.modAddedSuccess'));
    toast.success(t('addMods.addedSuccess', { name: meta.name }));
    setOpen(false);
    setProcessing(false);
  };

  return (
    <div className="h-full w-full">
      <div className="space-y-4 px-4">
        <PageTitle
          subtitle={t('addMods.subtitle')}
          title={t('addMods.title')}
        />

        <Card className="w-full border-0 shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UploadSimple weight="duotone" />
              {t('addMods.cardTitle')}
            </CardTitle>
            <CardDescription>{t('addMods.cardDescription')}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pb-8">
            {/* Files */}
            <div className="space-y-2">
              <div
                className={cn(
                  'relative flex h-40 w-full cursor-pointer items-center justify-center rounded-md border border-dashed transition-colors md:h-48',
                  dragging
                    ? 'bg-muted/50 ring-2 ring-primary/40'
                    : 'hover:bg-muted/40'
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget === e.target) setDragging(false);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragging(false);
                  let files = Array.from(e.dataTransfer.files || []);
                  if (
                    (!files.length || files.every((f) => !f)) &&
                    e.dataTransfer.items?.length
                  ) {
                    const fromItems = await readFromDataTransferItems(
                      e.dataTransfer.items
                    );
                    if (fromItems.length) files = fromItems;
                  }
                  const ds = detectSource(files);
                  if (!ds) {
                    toast.error(t('addMods.unsupportedFiles'));
                    return;
                  }
                  startDialog(ds);
                }}
              >
                <input
                  accept=".vpk,.zip,.rar,.7z,application/zip,application/x-7z-compressed,application/x-rar-compressed"
                  className="hidden"
                  directory="true"
                  multiple
                  // @ts-expect-error
                  onChange={onPickFiles}
                  ref={fileInputRef}
                  type="file"
                  webkitdirectory="true"
                />
                <div className="pointer-events-none text-center">
                  <UploadSimple className="mx-auto h-8 w-8" />
                  <div className="mt-2 font-medium text-sm">
                    {t('addMods.dropAreaText')}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t('addMods.supportedFormats')}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('addMods.finalizeTitle')}</DialogTitle>
            <DialogDescription>
              {t('addMods.finalizeDescription')}
            </DialogDescription>
          </DialogHeader>

          <ModMetadataForm hideCardChrome initial={initialMeta} ref={metaRef} />

          <div className="mt-4 space-y-4">
            <Form {...form}>
              <form onSubmit={(e) => e.preventDefault()}>
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('addMods.category')}</FormLabel>
                      <Select
                        defaultValue={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t('addMods.selectCategory')}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MOD_CATEGORY_ORDER.map((c) => (
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

            {/* source summary */}
            <div className="rounded-md bg-muted p-3 text-xs">
              {form.getValues('sourceType') === 'archive' ? (
                <div>
                  <span className="font-medium">{t('addMods.source')}:</span>{' '}
                  Archive → {(detected as any)?.file?.name}
                </div>
              ) : detected?.kind === 'vpk' ? (
                <div>
                  <span className="font-medium">{t('addMods.source')}:</span>{' '}
                  VPK → {fileName((detected as any).file)}
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button
              disabled={isProcessing}
              onClick={() => setOpen(false)}
              type="button"
              variant="ghost"
            >
              {t('addMods.cancel')}
            </Button>
            <Button disabled={isProcessing} onClick={finalize} type="button">
              {isProcessing ? t('addMods.processing') : t('addMods.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProgressIndicator />
    </div>
  );
};

export default AddMods;
