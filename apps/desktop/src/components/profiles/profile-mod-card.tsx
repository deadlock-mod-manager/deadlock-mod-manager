import type { ModDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Volume2 } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

export const ProfileModCard = ({ mod }: { mod: ModDto }) => {
  const { t } = useTranslation();
  const image = mod.images && mod.images.length > 0 ? mod.images[0] : mod.hero;
  const isSoundMod = mod.isAudio;

  return (
    <div className='flex items-center justify-between rounded-lg border p-3'>
      <div className='flex items-center gap-3'>
        {image && !isSoundMod && (
          <img
            className='h-10 w-10 rounded bg-muted'
            src={image}
            alt={mod.name}
            width={40}
            height={40}
          />
        )}
        {isSoundMod && (
          <div className='h-10 w-10 rounded bg-muted flex items-center justify-center'>
            <Volume2 className='h-5 w-5 text-muted-foreground' />
          </div>
        )}
        <div>
          <p className='font-medium text-sm'>{mod.name}</p>
          <p className='text-muted-foreground text-xs'>
            {t("by", { ns: "common" })} {mod.author}
          </p>
        </div>
      </div>

      <Badge className='h-5 rounded-full text-xs' variant='secondary'>
        {mod.category}
      </Badge>
    </div>
  );
};
