import { CheckIcon, GlobeIcon, ProhibitIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { pickerPingTone, RECENT_MATCH_MONTHS } from "@/lib/server-picker";
import { cn } from "@/lib/utils";
import type { ServerPickerLatency } from "@/types/generated/ServerPickerLatency";
import type { ServerPickerLocation } from "@/types/generated/ServerPickerLocation";

interface LocationRowProps {
  location: ServerPickerLocation;
  blocked: boolean;
  pending: boolean;
  observed: boolean | null;
  latency?: ServerPickerLatency;
  matches?: number;
  disabled: boolean;
  onChange: (id: string, blocked: boolean, extend: boolean) => void;
}

export const LocationRow = ({
  location,
  blocked,
  pending,
  observed,
  latency,
  matches,
  disabled,
  onChange,
}: LocationRowProps) => {
  const { t, i18n } = useTranslation();
  const ping = latency?.latencyMs;
  const latencyLabel =
    ping == null
      ? t(
          latency
            ? "serverPicker.unavailableShort"
            : "serverPicker.notMeasuredShort",
        )
      : t("serverPicker.milliseconds", { count: Math.round(ping) });
  // A pending edit already says what will happen; drift labels only matter
  // when the firewall disagrees with the saved selection.
  const note = pending
    ? t(blocked ? "serverPicker.willBlock" : "serverPicker.willAllow")
    : observed === true && !blocked
      ? t("serverPicker.currentlyBlocked")
      : observed === false && blocked
        ? t("serverPicker.currentlyAllowed")
        : null;
  return (
    <li className='border-t border-border/40'>
      <button
        type='button'
        aria-label={t("serverPicker.toggleLocation", { name: location.name })}
        aria-pressed={blocked}
        disabled={disabled}
        onClick={(event) => onChange(location.id, !blocked, event.shiftKey)}
        className={cn(
          "group flex min-h-12 w-full cursor-pointer select-none items-center gap-2.5 px-2 py-1.5 text-left outline-none transition-colors duration-150 hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed motion-reduce:transition-none",
          pending && "bg-primary/5",
        )}>
        {location.countryCode ? (
          <span
            aria-hidden
            className={cn(
              `fi fi-${location.countryCode.toLowerCase()} shrink-0 rounded-sm text-base transition-[opacity,filter] duration-150`,
              blocked && "opacity-40 grayscale",
            )}
          />
        ) : (
          <GlobeIcon
            aria-hidden
            className='size-4 shrink-0 text-muted-foreground'
          />
        )}
        <span className='min-w-0 flex-1'>
          <span
            className={cn(
              "block truncate text-xs font-medium transition-colors duration-150",
              blocked && "text-muted-foreground",
            )}
            title={location.name}>
            {location.name}
          </span>
          <span className='flex items-center gap-1.5 text-[10px] text-muted-foreground'>
            <span className='font-mono uppercase tracking-wide'>
              {location.id}
            </span>
            {matches ? (
              <span
                className='tabular-nums'
                title={t("serverPicker.recentMatchesHint", {
                  months: RECENT_MATCH_MONTHS,
                })}>
                {t("serverPicker.recentMatches", { count: matches })}
              </span>
            ) : null}
            {note && (
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  pending && "font-medium text-primary",
                )}>
                {pending && (
                  <span
                    aria-hidden
                    className='size-1 rounded-full bg-primary'
                  />
                )}
                {note}
              </span>
            )}
          </span>
        </span>
        <span
          className={cn(
            "w-16 shrink-0 text-right font-mono text-[11px] tabular-nums",
            blocked ? "text-muted-foreground/60" : pickerPingTone(ping),
          )}
          title={
            latency
              ? t("serverPicker.measuredAt", {
                  time: new Date(latency.measuredAt).toLocaleTimeString(
                    i18n.language,
                    { hour: "2-digit", minute: "2-digit" },
                  ),
                })
              : t("serverPicker.notMeasured")
          }>
          {latencyLabel}
        </span>
        <span
          aria-hidden
          className={cn(
            "inline-flex h-7 w-24 shrink-0 items-center justify-center gap-1.5 rounded-md border text-[11px] font-medium transition-[color,background-color,border-color,transform] duration-150 group-active:scale-[0.97] group-disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none",
            blocked
              ? "border-signal-poor/35 bg-signal-poor/10 text-signal-poor group-hover:border-signal-poor/60"
              : "border-transparent text-foreground/80 group-hover:border-border group-hover:text-foreground",
          )}>
          {blocked ? (
            <ProhibitIcon className='size-3' />
          ) : (
            <CheckIcon className='size-3 text-signal-good' />
          )}
          {t(blocked ? "serverPicker.blocked" : "serverPicker.allowed")}
        </span>
      </button>
    </li>
  );
};
