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
  Import,
} from "@deadlock-mods/ui/icons";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type InterchangeSource,
  useInterchangeSources,
} from "@/hooks/use-mod-interchange";
import { ImportWizardDialog } from "./import-wizard-dialog";

/**
 * "Import from other mod managers": one entry per mod manager DMM can read
 * (reported by the backend registry, so new managers appear without UI
 * changes), plus any manager's exported interchange file.
 */
export const ImportSourceMenu = () => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const sources = useInterchangeSources(menuOpen);
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
      <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid='interchange-import-menu'
            icon={<Import className='h-4 w-4' />}
            variant='outline'>
            {t("interchange.importButton")}
            <ChevronDown className='ml-1 h-3 w-3' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-72'>
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
