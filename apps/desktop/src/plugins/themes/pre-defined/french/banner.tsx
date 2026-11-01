import { useTranslation } from "react-i18next";
import { FrenchMeme } from "./meme";
import { useFrenchTax } from "./use-tax";

export function FrenchBanner() {
  const { t } = useTranslation();
  const tax = useFrenchTax();

  return (
    <div className='french-banner mb-4 flex min-h-24 shrink-0 flex-col justify-center gap-4 rounded-md px-4 py-5 sm:min-h-32 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
      <div className='flex min-w-0 flex-1 flex-col justify-center gap-2'>
        <h2 className='text-balance font-primary text-xl font-bold leading-tight tracking-tight sm:text-3xl'>
          {t("plugins.french.bannerTitle")}
        </h2>
        <p className='text-pretty text-xs leading-relaxed sm:text-sm'>
          {t("plugins.french.taxJoke", {
            size: tax.volume,
            tax: tax.amount,
          })}
        </p>
      </div>
      <FrenchMeme />
    </div>
  );
}
