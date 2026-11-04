import { openUrl } from "@tauri-apps/plugin-opener";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
}

// Images stay out: source media loads go through the source's declared media
// origins, which an inline Markdown image would bypass.
const DISALLOWED_ELEMENTS = ["img"];

export const MarkdownContent = ({ content }: MarkdownContentProps) => (
  <div className='markdown-description break-words text-sm leading-relaxed'>
    <Markdown
      components={{
        a: ({ href, children }) => (
          <a
            className='cursor-pointer break-words font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary/90'
            href={href}
            onClick={(event) => {
              event.preventDefault();
              if (href) void openUrl(href);
            }}>
            {children}
          </a>
        ),
      }}
      disallowedElements={DISALLOWED_ELEMENTS}
      remarkPlugins={[remarkGfm]}>
      {content}
    </Markdown>
  </div>
);
