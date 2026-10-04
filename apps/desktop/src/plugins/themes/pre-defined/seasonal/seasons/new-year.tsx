import { Button } from "@deadlock-mods/ui/components/button";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PartyHat } from "../art";
import { createFireworks, FIREWORK_EVENT } from "../effects";
import type { Season } from "../season";

const pad = (value: number) => String(value).padStart(2, "0");

const Sidebar = () => {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isNewYearsDay = now.getMonth() === 0 && now.getDate() === 1;
  const target = new Date(now.getFullYear() + 1, 0, 1);
  const remaining = Math.max(
    0,
    Math.floor((target.getTime() - now.getTime()) / 1000),
  );
  const days = Math.floor(remaining / 86_400);
  const clock = `${pad(Math.floor((remaining % 86_400) / 3600))}:${pad(
    Math.floor((remaining % 3600) / 60),
  )}:${pad(remaining % 60)}`;

  return (
    <div className='flex min-w-0 flex-1 flex-col gap-2'>
      <span className='text-xs uppercase tracking-widest text-muted-foreground'>
        {isNewYearsDay
          ? t("plugins.seasonal.newYear.greeting", { year: now.getFullYear() })
          : t("plugins.seasonal.newYear.countdownLabel", {
              year: target.getFullYear(),
            })}
      </span>
      {isNewYearsDay ? null : (
        <span className='seasonal-countdown' role='timer'>
          {days > 0 ? `${days}d ${clock}` : clock}
        </span>
      )}
      <Button
        size='sm'
        variant='outline'
        type='button'
        onClick={() => window.dispatchEvent(new Event(FIREWORK_EVENT))}>
        {t("plugins.seasonal.newYear.launch")}
      </Button>
    </div>
  );
};

export const newYear: Season = {
  i18nKey: "newYear",
  rootClass: "seasonal-new-year-theme-active",
  backdrop: {
    backgroundColor: "#060914",
    backgroundImage: `
      radial-gradient(ellipse 80% 45% at 50% 112%, rgba(255, 196, 80, 0.18), transparent 70%),
      radial-gradient(ellipse 60% 60% at 0% 0%, rgba(90, 60, 200, 0.2), transparent 70%),
      radial-gradient(circle, rgba(255, 255, 255, 0.55) 0.6px, transparent 1.3px),
      radial-gradient(circle, rgba(255, 236, 200, 0.4) 0.8px, transparent 1.5px)
    `,
    backgroundSize: "100% 100%, 100% 100%, 97px 97px, 151px 151px",
    backgroundPosition: "0 0, 0 0, 0 0, 40px 70px",
  },
  effect: createFireworks,
  layer: "back",
  Sidebar,
  logo: {
    colors: {
      "--primary": "44 88% 62%",
      "--primary-foreground": "228 45% 8%",
      "--secondary": "228 26% 18%",
    },
    Accessory: PartyHat,
  },
  hideouts: [
    { id: "clock", route: "/", place: "hang", at: 78, drop: 54 },
    { id: "popper", route: "/my-mods", place: "right", at: 52 },
    { id: "champagne", route: "/mods", place: "bottom", at: 82 },
    { id: "balloon", route: "/settings", place: "right", at: 30 },
    { id: "sparkler", route: "/plugins", place: "bottom", at: 64 },
  ],
};
