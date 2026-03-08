import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Markup } from "interweave";
import { transformMarkupLinks } from "@/lib/markup-transform";

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
        <div className='prose prose-sm dark:prose-invert max-w-none'>
          <Markup
            className='whitespace-pre-line text-sm leading-relaxed'
            content={description}
            transform={transformMarkupLinks}
          />
        </div>
      </CardContent>
    </Card>
  );
};
