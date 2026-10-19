import { Button } from "@deadlock-mods/ui/components/button";
import { Kbd } from "@deadlock-mods/ui/components/kbd";
import {
  Popover,
  PopoverAnchor,
  PopoverArrow,
  PopoverContent,
} from "@deadlock-mods/ui/components/popover";
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type ReactElement,
  useCallback,
  useEffect,
  useId,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "@/lib/analytics";
import type { AnalyticsEvents } from "@/lib/analytics/schema";
import {
  canShowHint,
  type FeatureHintId,
  getFeatureHint,
} from "@/lib/feature-hints";
import { useFeatureHintsSession } from "@/lib/feature-hints-session";
import { usePersistedStore } from "@/lib/store";

type HintAction = AnalyticsEvents["feature_hint_closed"]["action"];

type HintAnchorProps = ComponentPropsWithoutRef<typeof PopoverAnchor> & {
  hintId: FeatureHintId;
  /** Page conditions that make the hint worth showing, such as library size. */
  eligible?: boolean;
  /** Demonstrates the feature, for example by opening the menu it points at. */
  onShowMe?: (anchor: HTMLElement) => void;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  children: ReactElement;
};

/**
 * Wraps a control that is easy to miss. When the scheduler picks this hint,
 * the control pulses and a "Did you know?" card points at it. The feature
 * itself must call `markFeatureUsed` so users who find it alone never see it.
 */
export const HintAnchor = forwardRef<HTMLDivElement, HintAnchorProps>(
  (
    {
      hintId,
      eligible = true,
      onShowMe,
      side = "bottom",
      align = "center",
      children,
      ...anchorProps
    },
    forwardedRef,
  ) => {
    const { t } = useTranslation();
    const titleId = useId();
    const anchorRef = useRef<HTMLDivElement | null>(null);
    const hint = getFeatureHint(hintId);
    const available = usePersistedStore(
      (state) =>
        eligible && canShowHint(hintId, state.featureHints, Date.now()),
    );
    const used = usePersistedStore(
      (state) => state.featureHints.used[hintId] === true,
    );
    const active = useFeatureHintsSession((state) => state.active === hintId);

    useEffect(() => {
      usePersistedStore.getState().markFeatureHintSeen(hintId);
      return () => useFeatureHintsSession.getState().release(hintId);
    }, [hintId]);

    useEffect(() => {
      if (!available) return;
      const { register, unregister } = useFeatureHintsSession.getState();
      register(hintId);
      return () => unregister(hintId);
    }, [available, hintId]);

    const finish = useCallback(
      (action: HintAction) => {
        const session = useFeatureHintsSession.getState();
        if (session.active !== hintId) return;
        session.release(hintId);
        analytics.track("feature_hint_closed", { hint_id: hintId, action });
      },
      [hintId],
    );

    useEffect(() => {
      if (active && used) finish("used");
    }, [active, used, finish]);

    const setRef = useCallback(
      (node: HTMLDivElement | null) => {
        anchorRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef],
    );

    const handleOpenChange = (open: boolean) => {
      if (open || useFeatureHintsSession.getState().active !== hintId) {
        return;
      }
      // Using the feature can dismiss the card before the used effect runs.
      const store = usePersistedStore.getState();
      if (store.featureHints.used[hintId]) {
        finish("used");
        return;
      }
      store.ignoreFeatureHint(hintId);
      finish("ignored");
    };

    const handleShowMe = () => {
      const anchor = anchorRef.current;
      finish("show_me");
      usePersistedStore.getState().markFeatureUsed(hintId);
      // Let the card unmount first so the menu it opens keeps focus.
      requestAnimationFrame(() => {
        if (anchor) onShowMe?.(anchor);
      });
    };

    const handleGotIt = () => {
      usePersistedStore.getState().retireFeatureHint(hintId);
      finish("got_it");
    };

    const handleTurnOff = () => {
      usePersistedStore.getState().setFeatureHintsEnabled(false);
      finish("tips_off");
    };

    return (
      <Popover onOpenChange={handleOpenChange} open={active}>
        {/* The highlight attribute is only set while active so nested
            anchors on one control don't clear each other's. */}
        <PopoverAnchor
          asChild
          ref={setRef}
          {...anchorProps}
          {...(active ? { "data-feature-hint": "" } : {})}>
          {children}
        </PopoverAnchor>
        {active && (
          <PopoverContent
            align={align}
            aria-labelledby={titleId}
            className='w-80 border-primary/30 shadow-lg'
            collisionPadding={12}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onInteractOutside={(event) => {
              // Using the control itself is how the hint should end.
              if (
                event.target instanceof Node &&
                anchorRef.current?.contains(event.target)
              ) {
                event.preventDefault();
              }
            }}
            onOpenAutoFocus={(event) => event.preventDefault()}
            side={side}
            sideOffset={2}>
            <PopoverArrow asChild height={44} width={28}>
              <svg
                aria-hidden='true'
                className='feature-hint-arrow overflow-visible text-primary'
                fill='none'
                preserveAspectRatio='xMidYMid meet'
                viewBox='0 0 28 44'>
                <path
                  d='M9 3 C 3 15, 23 21, 14 40'
                  stroke='currentColor'
                  strokeLinecap='round'
                  strokeWidth='2'
                />
                <path
                  d='M8 33 L 14 40 L 20 34'
                  stroke='currentColor'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                />
              </svg>
            </PopoverArrow>
            <p className='font-semibold text-[11px] text-primary uppercase tracking-wider'>
              {t("featureHints.didYouKnow")}
            </p>
            <h3 className='mt-1 font-semibold text-sm' id={titleId}>
              {t(`featureHints.${hint.i18nKey}.title`)}
            </h3>
            <p className='mt-1.5 text-muted-foreground text-sm leading-relaxed'>
              {t(`featureHints.${hint.i18nKey}.body`)}
            </p>
            {"shortcut" in hint && (
              <div className='mt-2 flex items-center gap-1'>
                {hint.shortcut.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </div>
            )}
            <div className='mt-3 flex items-center gap-1'>
              {onShowMe && (
                <Button onClick={handleShowMe} size='sm'>
                  {t("featureHints.showMe")}
                </Button>
              )}
              <Button
                onClick={handleGotIt}
                size='sm'
                variant={onShowMe ? "ghost" : "default"}>
                {t("featureHints.gotIt")}
              </Button>
              <Button
                className='ml-auto h-7 px-2 text-muted-foreground text-xs'
                onClick={handleTurnOff}
                size='sm'
                variant='ghost'>
                {t("featureHints.turnOff")}
              </Button>
            </div>
          </PopoverContent>
        )}
      </Popover>
    );
  },
);
HintAnchor.displayName = "HintAnchor";
