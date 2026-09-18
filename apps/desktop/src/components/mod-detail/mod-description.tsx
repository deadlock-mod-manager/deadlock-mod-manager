import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { GameBananaMarkup } from "@/components/mod-detail/gamebanana-markup";

interface ModDescriptionProps {
  description: string;
}

export const ModDescription = ({ description }: ModDescriptionProps) => {
  if (!description) {
    return null;
  }

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader>
        <CardTitle>Description</CardTitle>
      </CardHeader>
      <CardContent>
        <GameBananaMarkup
          className='whitespace-pre-line'
          content={description}
        />
      </CardContent>
    </Card>
  );
};
