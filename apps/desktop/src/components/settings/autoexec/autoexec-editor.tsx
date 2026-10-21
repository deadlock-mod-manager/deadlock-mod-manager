import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deadlock-mods/ui/components/collapsible";
import { CaretRightIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { type RefObject, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AutoexecReadonlySection } from "@/lib/autoexec/autoexec-content";

type AutoexecEditorProps = {
  value: string;
  onChange: (value: string) => void;
  readonlySections: AutoexecReadonlySection[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

const getSectionLabelKey = (content: string) =>
  content.includes("Crosshair")
    ? "settings.autoexecManagedCrosshair"
    : "settings.autoexecManagedMapCommand";

export const AutoexecEditor = ({
  value,
  onChange,
  readonlySections,
  textareaRef,
}: AutoexecEditorProps) => {
  const { t } = useTranslation();
  const gutterRef = useRef<HTMLDivElement>(null);
  const lineCount = value.split("\n").length;

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='flex min-h-0 flex-1 font-mono text-[13px] leading-6'>
        <div
          aria-hidden
          className='w-12 shrink-0 select-none overflow-hidden border-border/30 border-r pt-2 pb-6 pr-3 text-right text-muted-foreground/60'
          ref={gutterRef}>
          {Array.from({ length: lineCount }, (_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
        <textarea
          aria-label={t("settings.autoexec")}
          className='min-h-0 flex-1 resize-none bg-transparent px-3 py-2 text-foreground outline-none placeholder:text-muted-foreground'
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            if (gutterRef.current) {
              gutterRef.current.scrollTop = event.currentTarget.scrollTop;
            }
          }}
          placeholder={t("settings.autoexecPlaceholder")}
          ref={textareaRef}
          spellCheck={false}
          value={value}
          wrap='off'
        />
      </div>

      {readonlySections.length > 0 && (
        <div className='flex shrink-0 flex-col gap-1.5 border-border/30 border-t p-2'>
          {readonlySections.map((section) => (
            <Collapsible key={section.start_line}>
              <CollapsibleTrigger className='group flex w-full items-center gap-2 rounded-md border border-border/40 border-dashed px-3 py-1.5 text-left text-muted-foreground text-xs transition-colors hover:border-border hover:text-foreground'>
                <LockSimpleIcon className='h-3.5 w-3.5 shrink-0' />
                <span className='font-medium text-foreground'>
                  {t(getSectionLabelKey(section.content))}
                </span>
                <span>
                  {t("settings.autoexecManagedLines", {
                    count: section.content.split("\n").length,
                  })}
                </span>
                <CaretRightIcon className='ml-auto h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-90' />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className='mt-1 max-h-48 overflow-auto rounded-md bg-background/40 px-3 py-2 font-mono text-muted-foreground text-xs leading-5'>
                  {section.content}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
};
