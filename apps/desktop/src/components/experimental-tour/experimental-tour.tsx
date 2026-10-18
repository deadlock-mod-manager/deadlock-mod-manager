import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CompassIcon,
} from "@phosphor-icons/react";
import { useCallback, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { usePersistedStore } from "@/lib/store";
import {
  TOUR_FEATURES,
  enableTourFeatures,
  type TourFeature,
} from "@/lib/experimental-tour";
import { TourPreview } from "./tour-preview";

export const ExperimentalTour = ({ replay = false }: { replay?: boolean }) => {
  const { t } = useTranslation();
  const headingId = useId();
  const focusHeading = useCallback((node: HTMLHeadingElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);
  const checkboxId = useId();
  const dismissed = usePersistedStore(
    (state) => state.experimentalTourDismissed,
  );
  const dismiss = usePersistedStore((state) => state.dismissExperimentalTour);
  const features = usePersistedStore((state) => state.experimentalFeatures);
  const [step, setStep] = useState<number | null>(null);
  const [selected, setSelected] = useState<TourFeature[]>([]);
  const feature = step === null ? undefined : TOUR_FEATURES[step];
  const complete = step === TOUR_FEATURES.length;
  const enabled = TOUR_FEATURES.filter((item) => features[item.id]);

  const close = () => {
    dismiss();
    setStep(null);
    setSelected([]);
  };
  const finish = () => {
    usePersistedStore.setState((state) => ({
      experimentalFeatures: enableTourFeatures(
        state.experimentalFeatures,
        selected,
      ),
      experimentalTourDismissed: true,
    }));
    setStep(TOUR_FEATURES.length);
  };

  if (!replay && dismissed && step === null) {
    return (
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-5 py-3'>
        <span className='flex items-center gap-2 text-sm text-muted-foreground'>
          <CompassIcon
            aria-hidden
            className='size-4 text-primary'
            weight='duotone'
          />
          {t("experimentalTour.invitation")}
        </span>
        <Button variant='outline' size='sm' onClick={() => setStep(0)}>
          {t("experimentalTour.start")}
          <ArrowRightIcon aria-hidden className='ml-2 size-4' />
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className='overflow-hidden rounded-xl border border-primary/20 bg-card'>
      {step === null ? (
        <div className='flex flex-wrap items-center justify-between gap-5 p-6'>
          <div className='flex items-start gap-4'>
            <CompassIcon
              aria-hidden
              className='mt-1 size-8 shrink-0 text-primary'
              weight='duotone'
            />
            <div>
              <p className='text-xs font-medium uppercase tracking-widest text-primary'>
                {t("experimentalTour.invitation")}
              </p>
              <h2 id={headingId} className='mt-1 text-xl font-semibold'>
                {t("experimentalTour.title")}
              </h2>
              <p className='mt-2 max-w-xl text-sm text-muted-foreground'>
                {t("experimentalTour.description")}
              </p>
              <p className='mt-2 text-xs text-muted-foreground'>
                {t("experimentalTour.duration")}
              </p>
            </div>
          </div>
          <div className='flex items-center gap-2'>
            {!replay && (
              <Button variant='ghost' onClick={close}>
                {t("experimentalTour.dismiss")}
              </Button>
            )}
            <Button
              onClick={() => {
                setSelected([]);
                setStep(0);
              }}>
              {t("experimentalTour.start")}
              <ArrowRightIcon aria-hidden className='ml-2 size-4' />
            </Button>
          </div>
        </div>
      ) : complete ? (
        <div
          className='p-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200'
          aria-live='polite'>
          <CheckCircleIcon
            aria-hidden
            className='mb-3 size-9 text-primary'
            weight='duotone'
          />
          <h2
            id={headingId}
            ref={focusHeading}
            tabIndex={-1}
            className='text-2xl font-semibold outline-none'>
            {t(
              enabled.length
                ? "experimentalTour.complete"
                : "experimentalTour.completeEmpty",
            )}
          </h2>
          <p className='mt-2 text-sm text-muted-foreground'>
            {t(
              enabled.length
                ? "experimentalTour.completeDescription"
                : "experimentalTour.emptyDescription",
            )}
          </p>
          <div className='mt-5 flex flex-wrap gap-2'>
            {enabled.map((item) => (
              <Button key={item.id} variant='outline' asChild>
                <Link to={item.path}>
                  {t("experimentalTour.open", {
                    feature: t(`featureFlags.features.${item.id}.title`),
                  })}
                  <ArrowRightIcon aria-hidden className='ml-2 size-4' />
                </Link>
              </Button>
            ))}
            <Button onClick={close}>{t("experimentalTour.done")}</Button>
          </div>
        </div>
      ) : feature ? (
        <div className='grid md:grid-cols-[1fr_1.1fr]'>
          <TourPreview feature={feature.id} />
          <div className='p-6'>
            <div className='flex items-center justify-between gap-4'>
              <div aria-hidden className='flex gap-1.5'>
                {TOUR_FEATURES.map((item, index) => (
                  <span
                    key={item.id}
                    className={`h-1 w-7 rounded-full motion-safe:transition-colors ${index <= step ? "bg-primary" : "bg-muted"}`}
                  />
                ))}
              </div>
              <span className='text-xs text-muted-foreground'>
                {t("experimentalTour.progress", {
                  current: step + 1,
                  total: TOUR_FEATURES.length,
                })}
              </span>
            </div>
            <div
              key={feature.id}
              className='mt-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200'
              aria-live='polite'>
              <p className='text-xs font-medium uppercase tracking-widest text-primary'>
                {t(`featureFlags.features.${feature.id}.title`)} ·{" "}
                {t("experimentalTour.experimental")}
              </p>
              <h2
                id={headingId}
                ref={focusHeading}
                tabIndex={-1}
                className='mt-2 text-2xl font-semibold outline-none'>
                {t(`experimentalTour.features.${feature.id}.title`)}
              </h2>
              <p className='mt-3 text-sm leading-relaxed text-muted-foreground'>
                {t(`experimentalTour.features.${feature.id}.description`)}
              </p>
              <div className='mt-6 flex items-start gap-3 rounded-lg border border-border p-4'>
                <Checkbox
                  id={checkboxId}
                  className='mt-0.5'
                  checked={
                    features[feature.id] || selected.includes(feature.id)
                  }
                  disabled={features[feature.id]}
                  onCheckedChange={(checked) =>
                    setSelected(
                      checked === true
                        ? [...selected, feature.id]
                        : selected.filter((id) => id !== feature.id),
                    )
                  }
                />
                <label htmlFor={checkboxId} className='text-sm font-medium'>
                  {t(
                    features[feature.id]
                      ? "experimentalTour.alreadyEnabled"
                      : "experimentalTour.enable",
                    { feature: t(`featureFlags.features.${feature.id}.title`) },
                  )}
                  <span className='mt-1 block text-xs font-normal leading-relaxed text-muted-foreground'>
                    {t(`experimentalTour.features.${feature.id}.hint`)}
                  </span>
                </label>
              </div>
            </div>
            <p className='mt-3 text-xs leading-relaxed text-muted-foreground'>
              {t("experimentalTour.warning")}
            </p>
            <p className='mt-2 text-xs text-muted-foreground'>
              {t("experimentalTour.pending")}
            </p>
            <div className='mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4'>
              <Button variant='ghost' onClick={close}>
                {t("experimentalTour.skip")}
              </Button>
              <div className='flex gap-2'>
                {step > 0 && (
                  <Button variant='ghost' onClick={() => setStep(step - 1)}>
                    {t("experimentalTour.back")}
                  </Button>
                )}
                <Button
                  onClick={
                    step === TOUR_FEATURES.length - 1
                      ? finish
                      : () => setStep(step + 1)
                  }>
                  {t(
                    step === TOUR_FEATURES.length - 1
                      ? "experimentalTour.finish"
                      : "experimentalTour.next",
                  )}
                  <ArrowRightIcon aria-hidden className='ml-2 size-4' />
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
