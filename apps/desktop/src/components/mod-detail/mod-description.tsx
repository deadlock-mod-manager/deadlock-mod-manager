import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Markup } from "interweave";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { createMarkupLinkTransform } from "@/lib/markup-transform";

interface ModDescriptionProps {
  description: string;
}

export const ModDescription = ({ description }: ModDescriptionProps) => {
  const navigate = useNavigate();
  const markupTransform = useMemo(
    () => createMarkupLinkTransform(navigate),
    [navigate],
  );

  if (!description) {
    return null;
  }

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader>
        <CardTitle>Description</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='gamebanana-description prose prose-sm dark:prose-invert max-w-none'>
          <Markup
            className='whitespace-pre-line text-sm leading-relaxed'
            content={description}
            transform={markupTransform}
          />
        </div>
      </CardContent>
    </Card>
  );
};
