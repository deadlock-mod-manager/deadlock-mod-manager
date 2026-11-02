import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { type CommandError } from "./bridge";

export type Problem = { label: string; error: CommandError };

const describeError = (t: TFunction, error: CommandError) =>
  t(`errors.${error.code}`, { defaultValue: error.message });

export function Problems({ problems }: { problems: Problem[] }) {
  const { t } = useTranslation();
  if (problems.length === 0) return null;
  return (
    <ul className='problems' role='alert'>
      {problems.map(({ label, error }) => (
        <li key={`${label}:${error.code}`} className='problem'>
          <span className='problem__label'>{label}</span>
          <span>{describeError(t, error)}</span>
        </li>
      ))}
    </ul>
  );
}
