import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { GameBananaMarkup } from "@/components/mod-detail/gamebanana-markup";
import { useTranslation } from "react-i18next";

interface ModDescriptionProps {
  description: string;
  plainText?: boolean;
}

export const ModDescription = ({
  description,
  plainText = false,
}: ModDescriptionProps) => {
  const { t } = useTranslation();
  if (!description) {
    return null;
  }

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader>
        <CardTitle>{t("modSources.modDescription")}</CardTitle>
      </CardHeader>
      <CardContent>
        {plainText ? (
          <p className='whitespace-pre-wrap break-words text-sm leading-relaxed'>
            {description}
          </p>
        ) : (
          <GameBananaMarkup
            className='whitespace-pre-line'
            content={description}
          />
        )}
      </CardContent>
    </Card>
  );
};
