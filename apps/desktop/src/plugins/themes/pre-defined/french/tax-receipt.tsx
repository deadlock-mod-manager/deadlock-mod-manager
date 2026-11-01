import { useTranslation } from "react-i18next";
import { useFrenchTax } from "./use-tax";

export function FrenchTaxReceipt() {
  const { t } = useTranslation();
  const tax = useFrenchTax();
  const year = new Date().getFullYear();

  return (
    <section
      aria-label={t("plugins.french.taxReceipt")}
      className='french-tax-receipt rounded-sm p-5'>
      <header className='flex items-start justify-between gap-6 border-b border-current/30 pb-4'>
        <div>
          <div aria-hidden='true' className='mb-2 flex h-2 w-10'>
            <span className='french-tax-blue flex-1' />
            <span className='flex-1' />
            <span className='french-tax-red flex-1' />
          </div>
          <p className='whitespace-pre-line text-xs font-bold uppercase leading-tight'>
            {t("plugins.french.republic")}
          </p>
          <p className='mt-1 font-serif text-[10px] italic'>
            {t("plugins.french.motto")}
          </p>
        </div>
        <p className='max-w-44 pt-1 text-right text-[10px] font-semibold uppercase leading-relaxed tracking-wide'>
          {t("plugins.french.taxAuthority")}
        </p>
      </header>
      <div className='py-4'>
        <h3 className='text-lg font-bold uppercase tracking-tight'>
          {t("plugins.french.taxReceipt")}
        </h3>
        <p className='mt-1 text-xs'>{t("plugins.french.taxSubject")}</p>
        <div className='mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 font-mono text-[10px] opacity-75'>
          <span>{t("plugins.french.taxYear", { year })}</span>
          <span>{t("plugins.french.taxReference", { year })}</span>
        </div>
      </div>
      <p className='mb-3 border-y border-current/25 py-1.5 text-[10px] font-semibold uppercase tracking-wider'>
        {t("plugins.french.taxCalculation")}
      </p>
      <dl className='space-y-2 text-xs'>
        <div className='flex items-baseline justify-between gap-4'>
          <dt>{t("plugins.french.downloadedVolume")}</dt>
          <dd className='shrink-0 font-mono'>
            {t("plugins.french.gigabytes", { size: tax.volume })}
          </dd>
        </div>
        <div className='flex items-baseline justify-between gap-4'>
          <dt>{t("plugins.french.bandwidthTax")}</dt>
          <dd className='shrink-0 font-mono'>
            {t("plugins.french.bandwidthRate", { rate: tax.rate })}
          </dd>
        </div>
      </dl>
      {tax.missingSizes > 0 ? (
        <p className='mt-2 text-[10px] leading-relaxed opacity-75'>
          {t("plugins.french.missingSizes", { count: tax.missingSizes })}
        </p>
      ) : null}
      <dl className='mt-4 border border-current/40 px-3 py-2.5'>
        <div className='flex items-center justify-between gap-4'>
          <dt className='text-xs font-semibold'>
            {t("plugins.french.totalDue")}
          </dt>
          <dd className='shrink-0 font-mono text-xl font-bold tabular-nums'>
            {tax.amount}
          </dd>
        </div>
      </dl>
      <footer className='mt-4 space-y-1 text-[10px] leading-relaxed'>
        <p>{t("plugins.french.taxReceiptJoke")}</p>
        <p className='opacity-65'>{t("plugins.french.taxDisclaimer")}</p>
      </footer>
    </section>
  );
}
