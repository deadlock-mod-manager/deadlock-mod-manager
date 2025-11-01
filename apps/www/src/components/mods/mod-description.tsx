import { Markup } from "interweave";

interface ModDescriptionProps {
  description: string;
  className?: string;
  textOnly?: boolean;
}

export const ModDescription = ({
  description,
  className = "",
  textOnly = false,
}: ModDescriptionProps) => {
  if (!description) {
    return null;
  }

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <Markup
        className='whitespace-pre-line text-sm leading-relaxed'
        content={textOnly ? description.replace(/<[^>]*>?/g, "") : description}
      />
    </div>
  );
};
