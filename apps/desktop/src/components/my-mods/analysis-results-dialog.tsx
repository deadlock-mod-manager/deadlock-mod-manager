import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { Separator } from "@deadlock-mods/ui/components/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import { Search } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AnalyzeAddonsResult, LocalAddonInfo } from "@/types/mods";
import { AddonSummaryCard } from "./addon-summary-card";
import { IdentifiedAddonsTab } from "./identified-addons-tab";
import { UnknownAddonsTab } from "./unknown-addons-tab";
import { AddAddonDialog } from "./add-addon-dialog";
import { ErrorsList } from "./addon-analysis-errors";

interface AnalysisResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: AnalyzeAddonsResult | null;
}

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

  const identifiedAddons = result.addons.filter((addon) => addon.remoteId);
  const unknownAddons = result.addons.filter(
    (addon) => !addon.remoteId && addon.vpkParsed?.fingerprint,
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
              {t("addons.analysisResultsDescription", {
                count: result.totalCount,
              })}
              {identifiedAddons.length > 0 && (
                <span className='text-muted-foreground ml-2'>
                  •{" "}
                  {t("addons.identifiedAndAdded", {
                    count: identifiedAddons.length,
                  })}
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
                Errors ({result.errors.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value='all'
              className='flex-1 mt-4 min-h-0 overflow-hidden'>
              <ScrollArea className='h-[300px] pr-4'>
                <div className='space-y-3'>
                  {result.addons.map((addon) => (
                    <AddonSummaryCard
                      key={addon.filePath}
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
                <ErrorsList errors={result.errors} />
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
