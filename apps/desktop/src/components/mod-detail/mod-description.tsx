import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { GameBananaMarkup } from "@/components/mod-detail/gamebanana-markup";
import { MarkdownContent } from "@/components/mod-detail/markdown-content";
import { useTranslation } from "react-i18next";

/** GameBanana sends its own HTML markup; custom sources declare plain text or Markdown. */
type ModDescriptionFormat = "gamebanana" | "plain" | "markdown";

interface ModDescriptionProps {
  description: string;
  format: ModDescriptionFormat;
}

export const ModDescription = ({
  description,
  format,
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
        {format === "markdown" ? (
          <MarkdownContent content={description} />
        ) : format === "plain" ? (
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
