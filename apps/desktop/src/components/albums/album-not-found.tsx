import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { ArrowLeft } from "@deadlock-mods/ui/icons";
import { CardsThreeIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

export const AlbumNotFound = ({ onBack }: { onBack: () => void }) => {
  const { t } = useTranslation();

  return (
    <Empty className='py-16'>
      <EmptyHeader>
        <EmptyMedia variant='default'>
          <CardsThreeIcon className='h-16 w-16' />
        </EmptyMedia>
        <EmptyTitle>{t("albums.notFoundTitle")}</EmptyTitle>
        <EmptyDescription>{t("albums.notFoundDescription")}</EmptyDescription>
        <Button className='mt-4' onClick={onBack} variant='outline'>
          <ArrowLeft className='h-4 w-4' />
          {t("albums.backToAlbums")}
        </Button>
      </EmptyHeader>
    </Empty>
  );
};
