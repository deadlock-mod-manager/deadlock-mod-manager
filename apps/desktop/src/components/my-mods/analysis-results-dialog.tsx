import { open } from "@tauri-apps/plugin-shell";
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import ModMetadataForm, {
  type ModMetadata,
  type ModMetadataFormHandle,
} from "@/components/mod-creation/mod-metadata-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useModProcessor } from "@/hooks/use-mod-processor";
import { ModCategory } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";
import type { AnalyzeAddonsResult, LocalAddonInfo } from "@/types/mods";
import { VpkEntriesDisplay } from "./vpk-entries-display";

interface AnalysisResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: AnalyzeAddonsResult | null;
}

interface AddAddonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addon: LocalAddonInfo | null;
}

interface AddonInfoProps {
  addon: LocalAddonInfo;
  isIdentified: boolean;
}

const AddonInfo = ({ addon, isIdentified }: AddonInfoProps) => {
  if (isIdentified) {
    return (
      <div className='space-y-1'>
        <p className='text-xs text-foreground font-medium'>
          {addon.matchInfo?.modName}
        </p>
        <p className='text-xs text-muted-foreground'>
          by {addon.matchInfo?.modAuthor} • {addon.matchInfo?.certainty}% match
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      <p className='text-xs text-muted-foreground'>
        {(addon.vpkParsed.fingerprint.fileSize / 1024 / 1024).toFixed(1)} MB •{" "}
        {addon.vpkParsed.fingerprint.fileCount} files
      </p>
      {addon.vpkParsed.entries && addon.vpkParsed.entries.length > 0 && (
        <VpkEntriesDisplay entries={addon.vpkParsed.entries} />
      )}
    </div>
  );
};

interface AddonActionsProps {
  addon: LocalAddonInfo;
  isIdentified: boolean;
  isAlreadyInLibrary: boolean;
  onAddToLibrary?: (addon: LocalAddonInfo) => void;
  onExternalLinkClick: () => void;
}

const AddonActions = ({
  addon,
  isIdentified,
  isAlreadyInLibrary,
  onAddToLibrary,
  onExternalLinkClick,
}: AddonActionsProps) => {
  if (isIdentified) {
    return (
      <>
        <Badge variant='default' className='bg-green-600 hover:bg-green-700'>
          Auto-Added to Library
        </Badge>
        <ExternalLink
          className='w-4 h-4 text-muted-foreground hover:text-foreground cursor-pointer'
          onClick={onExternalLinkClick}
        />
      </>
    );
  }

  if (isAlreadyInLibrary) {
    return (
      <Badge variant='secondary' className='h-7 text-xs'>
        Added to Library
      </Badge>
    );
  }

  return (
    <Button
      size='sm'
      variant='outline'
      onClick={() => onAddToLibrary?.(addon)}
      className='h-7 text-xs'>
      <Plus className='w-3 h-3 mr-1' />
      Add to Library
    </Button>
  );
};

const AddonSummaryCard = ({
  addon,
  onAddToLibrary,
}: {
  addon: LocalAddonInfo;
  onAddToLibrary?: (addon: LocalAddonInfo) => void;
}) => {
  const localMods = usePersistedStore((state) => state.localMods);
  const isIdentified = !!(addon.remoteId && addon.matchInfo);
  const hasError = !addon.vpkParsed || !addon.vpkParsed.fingerprint;

  // Check if this addon has already been added to the library
  const isAlreadyInLibrary = localMods.some(
    (mod) =>
      mod.path === addon.filePath ||
      mod.installedVpks?.includes(addon.filePath),
  );

  const handleExternalLinkClick = async () => {
    if (addon.remoteId) {
      try {
        // Construct GameBanana URL from remoteId
        const gameBananaUrl = `https://gamebanana.com/mods/${addon.remoteId}`;
        await open(gameBananaUrl);
      } catch (error) {
        console.error("Failed to open GameBanana link:", error);
      }
    }
  };

  if (hasError) {
    return (
      <div className='flex items-start justify-between p-4 border bg-muted/30 rounded-lg'>
        <div className='flex items-start gap-3'>
          <XCircle className='w-5 h-5 text-muted-foreground shrink-0 mt-0.5' />
          <div>
            <p className='font-medium text-sm'>{addon.fileName}</p>
            <p className='text-xs text-muted-foreground'>
              Failed to parse VPK file
            </p>
          </div>
        </div>
        <Badge variant='secondary' className='shrink-0 mt-0.5'>
          Error
        </Badge>
      </div>
    );
  }

  return (
    <div className='flex items-start justify-between p-4 border bg-muted/30 rounded-lg'>
      <div className='flex items-start gap-3 min-w-0 flex-1'>
        <div className='min-w-0 flex-1'>
          <p className='font-medium text-sm truncate'>{addon.fileName}</p>
          <AddonInfo addon={addon} isIdentified={isIdentified} />
        </div>
      </div>
      <div className='flex items-start gap-2 shrink-0 mt-0.5'>
        <AddonActions
          addon={addon}
          isIdentified={isIdentified}
          isAlreadyInLibrary={isAlreadyInLibrary}
          onAddToLibrary={onAddToLibrary}
          onExternalLinkClick={handleExternalLinkClick}
        />
      </div>
    </div>
  );
};

interface IdentifiedAddonsTabProps {
  identifiedAddons: LocalAddonInfo[];
  onAddToLibrary: (addon: LocalAddonInfo) => void;
}

const IdentifiedAddonsTab = ({
  identifiedAddons,
  onAddToLibrary,
}: IdentifiedAddonsTabProps) => {
  if (identifiedAddons.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-12 text-center'>
        <Search className='w-12 h-12 text-muted-foreground/50 mb-4' />
        <p className='text-muted-foreground'>No mods were identified</p>
        <p className='text-sm text-muted-foreground/70 mt-1'>
          These addons might be custom or not in our database
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3 mb-4'>
        <div className='flex items-start gap-2'>
          <CheckCircle className='w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5' />
          <div className='text-xs text-green-800 dark:text-green-200'>
            <p className='font-medium mb-1'>Automatically Added</p>
            <p>
              These mods were recognized from our database and have been
              automatically added to your library with their correct information
              and marked as installed.
            </p>
          </div>
        </div>
      </div>
      {identifiedAddons.map((addon, index) => (
        <AddonSummaryCard
          key={`identified-${index}-${addon.filePath}`}
          addon={addon}
          onAddToLibrary={onAddToLibrary}
        />
      ))}
    </div>
  );
};

interface UnknownAddonsTabProps {
  unknownAddons: LocalAddonInfo[];
  onAddToLibrary: (addon: LocalAddonInfo) => void;
}

const UnknownAddonsTab = ({
  unknownAddons,
  onAddToLibrary,
}: UnknownAddonsTabProps) => {
  if (unknownAddons.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-12 text-center'>
        <CheckCircle className='w-12 h-12 text-muted-foreground/50 mb-4' />
        <p className='text-muted-foreground'>All addons were identified!</p>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      {unknownAddons.map((addon, index) => (
        <AddonSummaryCard
          key={`unknown-${index}-${addon.filePath}`}
          addon={addon}
          onAddToLibrary={onAddToLibrary}
        />
      ))}
    </div>
  );
};

const AddAddonDialog = ({ open, onOpenChange, addon }: AddAddonDialogProps) => {
  const { processLocalAddon } = useModProcessor();
  const [isProcessing, setIsProcessing] = useState(false);
  const [category, setCategory] = useState(ModCategory.SKINS);
  const [initialMeta, setInitialMeta] = useState<
    Partial<ModMetadata> | undefined
  >(undefined);
  const metaRef = useRef<ModMetadataFormHandle>(null);

  // Reset form when addon changes
  useEffect(() => {
    if (addon) {
      const baseName = addon.fileName.replace(/\.(vpk|zip|rar|7z)$/i, "");
      setInitialMeta({
        name: baseName,
        author: "",
        description: `Local mod: ${addon.fileName}`,
      });
      setCategory(ModCategory.SKINS);
    }
  }, [addon]);

  const handleAdd = async () => {
    if (!addon) {
      toast.error("No addon selected");
      return;
    }

    const metadata = await metaRef.current?.validateAndGet();
    if (!metadata) {
      return;
    }

    setIsProcessing(true);
    try {
      // Use a custom processMod for already-installed local addons
      await processLocalAddon(metadata, category, addon.filePath);
      toast.success(`Added "${metadata.name}" to library`);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to add mod:", error);
      toast.error("Failed to add mod to library");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!addon) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Add to Library</DialogTitle>
          <DialogDescription>
            Add "{addon.fileName}" to your mod library
          </DialogDescription>
        </DialogHeader>

        <ModMetadataForm hideCardChrome initial={initialMeta} ref={metaRef} />

        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='category'>Category</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as ModCategory)}>
              <SelectTrigger>
                <SelectValue placeholder='Select a category' />
              </SelectTrigger>
              <SelectContent>
                {Object.values(ModCategory).map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3'>
            <div className='flex items-start gap-2'>
              <AlertTriangle className='w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5' />
              <div className='text-xs text-amber-800 dark:text-amber-200'>
                <p className='font-medium mb-1'>Custom Mod Warning</p>
                <p>
                  This mod is already installed in your game directory. If you
                  disable it later, you won't be able to re-install it
                  automatically since it's not from our database. You would need
                  to manually re-add it.
                </p>
              </div>
            </div>
          </div>

          <div className='rounded-md bg-muted p-3 text-xs'>
            <span className='font-medium'>Source:</span> {addon.fileName}
          </div>
        </div>

        <div className='flex justify-end gap-2 mt-6'>
          <Button
            variant='ghost'
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={isProcessing}>
            {isProcessing ? "Adding..." : "Add to Library"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ErrorsList = ({ errors }: { errors: string[] }) => {
  const { t } = useTranslation();

  if (errors.length === 0) return null;

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2'>
        <AlertTriangle className='w-4 h-4 text-amber-500' />
        <h3 className='font-medium text-sm'>
          {t("addons.errors")} ({errors.length})
        </h3>
      </div>
      <div className='space-y-2'>
        {errors.map((error) => (
          <div
            key={error.slice(0, 50)}
            className='p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md'>
            <p className='text-sm text-amber-800 dark:text-amber-200'>
              {error}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export const AnalysisResultsDialog = ({
  open,
  onOpenChange,
  result,
}: AnalysisResultsDialogProps) => {
  const { t } = useTranslation();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedAddon, setSelectedAddon] = useState<LocalAddonInfo | null>(
    null,
  );

  const handleAddToLibrary = (addon: LocalAddonInfo) => {
    setSelectedAddon(addon);
    setAddDialogOpen(true);
  };

  if (!result) {
    return null;
  }

  const identifiedAddons = result.addons.filter(
    (addon) => addon.remoteId && addon.matchInfo,
  );
  const unknownAddons = result.addons.filter(
    (addon) => !addon.remoteId && addon.vpkParsed?.fingerprint,
  );
  const errorAddons = result.addons.filter(
    (addon) => !addon.vpkParsed || !addon.vpkParsed.fingerprint,
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='max-w-4xl max-h-[70vh] flex flex-col'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <Search className='w-5 h-5' />
              {t("addons.analysisResults")}
            </DialogTitle>
            <DialogDescription>
              Found {result.totalCount} addon
              {result.totalCount !== 1 ? "s" : ""} in your game directory
              {identifiedAddons.length > 0 && (
                <span className='text-muted-foreground ml-2'>
                  • {identifiedAddons.length} identified and automatically added
                  to your library
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue='all' className='flex-1 flex flex-col min-h-0'>
            <TabsList className='grid w-full grid-cols-4 shrink-0'>
              <TabsTrigger value='all'>
                All ({result.addons.length})
              </TabsTrigger>
              <TabsTrigger value='identified'>
                Identified ({identifiedAddons.length})
              </TabsTrigger>
              <TabsTrigger value='unknown'>
                Unknown ({unknownAddons.length})
              </TabsTrigger>
              <TabsTrigger value='errors'>
                Errors ({errorAddons.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value='all'
              className='flex-1 mt-4 min-h-0 overflow-hidden'>
              <ScrollArea className='h-[300px] pr-4'>
                <div className='space-y-3'>
                  {result.addons.map((addon, index) => (
                    <AddonSummaryCard
                      key={`addon-${index}-${addon.filePath}`}
                      addon={addon}
                      onAddToLibrary={handleAddToLibrary}
                    />
                  ))}
                  {result.errors.length > 0 && (
                    <>
                      <Separator className='my-4' />
                      <ErrorsList errors={result.errors} />
                    </>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value='identified'
              className='flex-1 mt-4 min-h-0 overflow-hidden'>
              <ScrollArea className='h-[300px] pr-4'>
                <IdentifiedAddonsTab
                  identifiedAddons={identifiedAddons}
                  onAddToLibrary={handleAddToLibrary}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value='unknown'
              className='flex-1 mt-4 min-h-0 overflow-hidden'>
              <ScrollArea className='h-[300px] pr-4'>
                <UnknownAddonsTab
                  unknownAddons={unknownAddons}
                  onAddToLibrary={handleAddToLibrary}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value='errors'
              className='flex-1 mt-4 min-h-0 overflow-hidden'>
              <ScrollArea className='h-[300px] pr-4'>
                <div className='space-y-3'>
                  {errorAddons.map((addon, index) => (
                    <AddonSummaryCard
                      key={`error-${index}-${addon.filePath}`}
                      addon={addon}
                      onAddToLibrary={handleAddToLibrary}
                    />
                  ))}
                  {result.errors.length > 0 && (
                    <>
                      <Separator className='my-4' />
                      <ErrorsList errors={result.errors} />
                    </>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AddAddonDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        addon={selectedAddon}
      />
    </>
  );
};
