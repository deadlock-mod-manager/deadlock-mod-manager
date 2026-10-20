import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ChevronDown,
  FileInput,
  FolderSearch,
  Plus,
} from "@deadlock-mods/ui/icons";
import { UploadSimple } from "@phosphor-icons/react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { HintAnchor } from "@/components/feature-hints/hint-anchor";
import { canShowHint } from "@/lib/feature-hints";
import { usePersistedStore } from "@/lib/store";
import {
  type InterchangeSource,
  useInterchangeSources,
} from "@/hooks/use-mod-interchange";
import { ImportWizardDialog } from "./import-wizard-dialog";

/**
 * "Add mods": local files, plus one import entry per mod manager DMM can read
 * (reported by the backend registry, so new managers appear without UI
 * changes) and any manager's exported interchange file.
 */
export const AddModsMenu = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const markFeatureUsed = usePersistedStore((state) => state.markFeatureUsed);
  // Detection only runs for the hint while it could still be shown.
  const hintPossible = usePersistedStore((state) =>
    canShowHint("import-from-manager", state.featureHints, Date.now()),
  );
  const sources = useInterchangeSources(menuOpen || hintPossible);
  const otherManagerFound = sources.data?.some((info) => info.found) ?? false;
  const [source, setSource] = useState<InterchangeSource | null>(null);

  const pickLocation = async (id: string, name: string) => {
    const chosen = await openDialog({
      directory: true,
      multiple: false,
      title: t("interchange.pickManagerFolder", { source: name }),
    });
    if (typeof chosen === "string") {
      setSource({ kind: "manager", id, name, location: chosen });
    }
  };

  const pickBundle = async () => {
    const chosen = await openDialog({
      multiple: false,
      title: t("interchange.pickBundle"),
      filters: [{ name: "mod-interchange.json", extensions: ["json"] }],
    });
    if (typeof chosen === "string") setSource({ kind: "bundle", path: chosen });
  };

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (open) markFeatureUsed("import-from-manager");
        }}
        open={menuOpen}>
        <HintAnchor
          align='end'
          eligible={otherManagerFound}
          hintId='import-from-manager'
          onShowMe={() => setMenuOpen(true)}>
          <DropdownMenuTrigger asChild>
            <Button
              data-testid='interchange-import-menu'
              icon={<Plus className='h-4 w-4' />}
              variant='outline'>
              {t("myMods.addMods")}
              <ChevronDown className='ml-1 h-3 w-3' />
            </Button>
          </DropdownMenuTrigger>
        </HintAnchor>
        <DropdownMenuContent align='end' className='w-72'>
          <DropdownMenuItem
            data-testid='add-local-mod'
            onSelect={() => navigate("/add-mods")}>
            <UploadSimple className='h-4 w-4' />
            {t("navigation.addMods")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>
            {t("interchange.managersLabel")}
          </DropdownMenuLabel>
          {sources.isLoading && (
            <DropdownMenuItem disabled>
              {t("interchange.detecting")}
            </DropdownMenuItem>
          )}
          {sources.data?.map((info) => (
            <DropdownMenuItem
              data-testid={`interchange-source-${info.id}`}
              key={info.id}
              onSelect={() => {
                if (info.found) {
                  setSource({ kind: "manager", id: info.id, name: info.name });
                } else {
                  toast.info(
                    t("interchange.notFoundPick", { source: info.name }),
                  );
                  void pickLocation(info.id, info.name);
                }
              }}>
              <div className='flex w-full items-center justify-between gap-2'>
                <span>{info.name}</span>
                <span className='text-muted-foreground text-xs'>
                  {info.found
                    ? t("interchange.detected")
                    : t("interchange.notDetected")}
                </span>
              </div>
            </DropdownMenuItem>
          ))}
          {sources.data?.map((info) => (
            <DropdownMenuItem
              key={`${info.id}-folder`}
              onSelect={() => void pickLocation(info.id, info.name)}>
              <FolderSearch className='h-4 w-4' />
              {t("interchange.chooseManagerFolder", { source: info.name })}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid='interchange-source-bundle'
            onSelect={() => void pickBundle()}>
            <FileInput className='h-4 w-4' />
            {t("interchange.openBundle")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ImportWizardDialog
        onOpenChange={(open) => {
          if (!open) setSource(null);
        }}
        source={source}
      />
    </>
  );
};
