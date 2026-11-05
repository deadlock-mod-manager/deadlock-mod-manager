import { useTranslation } from "react-i18next";

export function WorkbenchGuide({ expanded }: { expanded: boolean }) {
  const { t } = useTranslation();
  return (
    <details
      id='workbench-guide'
      className='max-h-56 shrink-0 overflow-auto rounded-lg border bg-card px-4 py-3 text-xs'
      open={expanded || undefined}>
      <summary className='cursor-pointer font-medium'>
        {t("workbenchGuide.title")}
      </summary>
      <ol className='mt-4 grid gap-4 sm:grid-cols-3 xl:grid-cols-5'>
        {(
          ["open", "edit", "preview", "compile", "test"] satisfies string[]
        ).map((step, index) => (
          <li key={step} className='space-y-1'>
            <p className='font-medium'>
              <span className='mr-2 font-mono text-[10px] text-primary'>
                {String(index + 1).padStart(2, "0")}
              </span>
              {t(`workbenchGuide.${step}.title`)}
            </p>
            <p className='max-w-prose text-muted-foreground'>
              {t(`workbenchGuide.${step}.description`)}
            </p>
          </li>
        ))}
      </ol>
      <p className='mt-3 border-t pt-2 text-muted-foreground'>
        {t("workbenchGuide.modelEditingScope")}
      </p>
    </details>
  );
}
