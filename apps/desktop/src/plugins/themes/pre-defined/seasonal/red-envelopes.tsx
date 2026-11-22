import { toast } from "@deadlock-mods/ui/components/sonner";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ART } from "./art";
import { pick, random } from "./effect-canvas";
import { addLuckyCoins } from "./progress";

/** Lucky amounts; repeats make the small ones common and 888 rare. */
const AMOUNTS = [6, 6, 8, 8, 8, 18, 18, 66, 66, 88, 168, 888];
const BLESSINGS = ["fu", "shou", "cai", "xi", "an", "chun"] as const;

type FloatingEnvelope = { id: number; left: number; duration: number };

export const RedEnvelopes = () => {
  const { t } = useTranslation();
  const [envelopes, setEnvelopes] = useState<FloatingEnvelope[]>([]);

  useEffect(() => {
    let nextId = 0;
    let timer: ReturnType<typeof setTimeout>;
    const release = (delay: number) => {
      timer = setTimeout(() => {
        setEnvelopes((list) => [
          ...list,
          { id: nextId++, left: random(30, 88), duration: random(11, 16) },
        ]);
        release(random(20_000, 45_000));
      }, delay);
    };
    release(5_000);
    return () => clearTimeout(timer);
  }, []);

  const remove = (id: number) =>
    setEnvelopes((list) => list.filter((envelope) => envelope.id !== id));

  return createPortal(
    <>
      {envelopes.map((envelope) => (
        <button
          key={envelope.id}
          type='button'
          className='seasonal-envelope'
          style={{
            left: `${envelope.left}%`,
            animationDuration: `${envelope.duration}s`,
          }}
          aria-label={t("plugins.seasonal.lunarNewYear.catchEnvelope")}
          title={t("plugins.seasonal.lunarNewYear.catchEnvelope")}
          onAnimationEnd={() => remove(envelope.id)}
          onClick={() => {
            const amount = pick(AMOUNTS);
            addLuckyCoins(new Date().getFullYear(), amount);
            toast(
              t("plugins.seasonal.lunarNewYear.envelopeOpened", {
                amount,
                blessing: t(
                  `plugins.seasonal.lunarNewYear.blessings.${pick(BLESSINGS)}`,
                ),
              }),
            );
            remove(envelope.id);
          }}>
          <ART.envelope />
        </button>
      ))}
    </>,
    document.body,
  );
};
