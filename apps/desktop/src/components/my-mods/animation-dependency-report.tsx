import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@deadlock-mods/ui/components/accordion";
import { useTranslation } from "react-i18next";
import type { AnimationDependencyCheck } from "@/types/generated/AnimationDependencyCheck";

export function AnimationDependencyReport({
  checks,
  modNames,
}: {
  checks: readonly AnimationDependencyCheck[];
  modNames: ReadonlyMap<string, string>;
}) {
  const { t } = useTranslation();
  if (checks.length === 0) return null;
  return (
    <Accordion className='rounded-md border' type='multiple'>
      <AccordionItem className='border-b-0 px-3' value='animation-dependencies'>
        <AccordionTrigger className='py-2.5'>
          {t("modOrdering.animationChecks.title")}
        </AccordionTrigger>
        <AccordionContent className='space-y-3'>
          <p className='text-muted-foreground text-xs'>
            {t("modOrdering.animationChecks.scope")}
          </p>
          {checks.map((check) => (
            <div
              className='space-y-1 text-xs'
              key={`${check.modId}:${check.filePath}`}>
              <p className='font-medium'>
                {modNames.get(check.modId) ?? check.modId}
              </p>
              <code className='block break-all text-muted-foreground'>
                {check.filePath}
              </code>
              <p>
                {t("modOrdering.animationChecks.result", {
                  before: t(
                    `modOrdering.animationChecks.status.${check.before.status}`,
                  ),
                  after: t(
                    `modOrdering.animationChecks.status.${check.after.status}`,
                  ),
                  count: check.after.checkedResources,
                })}
              </p>
              {check.after.issues.length > 0 ? (
                <ul className='space-y-1 text-muted-foreground'>
                  {check.after.issues.map((issue) => (
                    <li
                      className='break-all'
                      key={`${issue.resource}:${issue.kind}:${issue.detail}`}>
                      <code>{issue.resource}</code>: {issue.detail}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
