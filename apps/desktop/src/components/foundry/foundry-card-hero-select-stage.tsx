import { DEFAULT_FOUNDRY_SKINS } from "@/lib/foundry-default-skins";
import type { FoundryCardPreview } from "@/types/foundry";
import { useFoundry } from "./foundry-context";

/** The selected card in a hero-select lineup, the way players will see it. */
export const HeroSelectStage = ({ card }: { card: FoundryCardPreview }) => {
  const { manifest } = useFoundry();
  const hero = manifest?.heroDisplay ?? manifest?.hero ?? "";
  const neighbours = DEFAULT_FOUNDRY_SKINS.filter(
    (skin) => skin.hero !== hero,
  ).slice(0, 2);

  return (
    <div className='relative flex h-[200px] items-center justify-center gap-3 overflow-hidden rounded-lg bg-gradient-to-b from-muted/60 to-background'>
      <img
        alt=''
        className='h-[84px] w-[62px] rounded object-cover opacity-35'
        src={neighbours[0]?.image}
      />
      <div className='relative h-[150px] w-[110px] overflow-hidden rounded border-2 border-primary shadow-[0_0_24px_-6px_hsl(var(--primary))]'>
        <img alt='' className='h-full w-full object-cover' src={card.dataUrl} />
        <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent pt-8 pb-2 text-center font-bold text-xs uppercase tracking-[0.12em]'>
          {hero}
        </div>
      </div>
      <img
        alt=''
        className='h-[84px] w-[62px] rounded object-cover opacity-35'
        src={neighbours[1]?.image}
      />
    </div>
  );
};
