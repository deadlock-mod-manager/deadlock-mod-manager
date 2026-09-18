import { cn } from "@deadlock-mods/ui/lib/utils";
import { Markup } from "interweave";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { createMarkupLinkTransform } from "@/lib/markup-transform";

interface GameBananaMarkupProps {
  content: string;
  className?: string;
}

export const GameBananaMarkup = ({
  content,
  className,
}: GameBananaMarkupProps) => {
  const navigate = useNavigate();
  const markupTransform = useMemo(
    () => createMarkupLinkTransform(navigate),
    [navigate],
  );

  return (
    <div className='gamebanana-description prose prose-sm dark:prose-invert max-w-none'>
      <Markup
        className={cn("text-sm leading-relaxed", className)}
        content={content}
        transform={markupTransform}
      />
    </div>
  );
};
