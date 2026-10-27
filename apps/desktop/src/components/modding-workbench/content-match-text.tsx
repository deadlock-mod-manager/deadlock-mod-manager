import { splitContentMatch } from "@/lib/archive-content-search";

export function ContentMatchText({
  text,
  start,
  end,
}: {
  text: string;
  start: number;
  end: number;
}) {
  const parts = splitContentMatch(text, start, end);
  return (
    <>
      {parts.before}
      <mark className='rounded-sm bg-primary/25 text-foreground'>
        {parts.match || "▏"}
      </mark>
      {parts.after}
    </>
  );
}
