import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { ExternalLink, Plus } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { LocalAddonInfo } from "@/types/mods";

interface AddonActionsProps {
  addon: LocalAddonInfo;
  isIdentified: boolean;
  isAlreadyInLibrary: boolean;
  isCheckingLibrary: boolean;
  onAddToLibrary?: (addon: LocalAddonInfo) => void;
  onExternalLinkClick: () => void;
}

export const AddonActions = ({
  addon,
  isIdentified,
  isAlreadyInLibrary,
  isCheckingLibrary,
  onAddToLibrary,
  onExternalLinkClick,
}: AddonActionsProps) => {
  const { t } = useTranslation();

  if (isIdentified) {
    return (
      <>
        <Badge
          variant={isAlreadyInLibrary ? "secondary" : "outline"}
          className='h-7 text-xs'>
          {isAlreadyInLibrary
            ? t("addons.inLibrary")
            : t("addons.notInLibrary")}
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
        {t("addons.inLibrary")}
      </Badge>
    );
  }

  return (
    <Button
      size='sm'
      variant='outline'
      disabled={isCheckingLibrary}
      onClick={() => onAddToLibrary?.(addon)}
      className='h-7 text-xs'>
      <Plus className='w-3 h-3 mr-1' />
      Add to Library
    </Button>
  );
};
