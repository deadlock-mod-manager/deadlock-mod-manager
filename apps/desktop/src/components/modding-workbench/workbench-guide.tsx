import { useTranslation } from "react-i18next";

export function WorkbenchGuide({ expanded }: { expanded: boolean }) {
  const { t } = useTranslation();
  return (
    <details
      className='shrink-0 rounded-md border px-3 py-2 text-xs'
      open={expanded || undefined}>
      <summary className='cursor-pointer font-medium'>
        {t("workbenchGuide.title")}
      </summary>
      <ol className='mt-3 grid gap-3 sm:grid-cols-5'>
        {(
          ["open", "edit", "preview", "compile", "test"] satisfies string[]
        ).map((step, index) => (
          <li key={step} className='space-y-1'>
            <p className='font-medium'>
              <span className='mr-1 text-muted-foreground'>{index + 1}.</span>
              {t(`workbenchGuide.${step}.title`)}
            </p>
            <p className='max-w-prose text-muted-foreground'>
              {t(`workbenchGuide.${step}.description`)}
            </p>
          </li>
        ))}
      </ol>
      <p className='mt-3 border-t pt-2 text-muted-foreground'>
        {t("workbenchGuide.modelEditingPlanned")}
      </p>
    </details>
  );
}
