import { HeroSectionHeader } from "@/components/skins/hero-section-header";
import { HeroSoundRow } from "@/components/skins/hero-sound-row";
import type { LocalMod } from "@/types/mods";

interface HeroSoundsSectionProps {
  title: string;
  hint: string;
  hero: string;
  mods: LocalMod[];
  activeIds: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (mod: LocalMod) => void;
  onRemove: (mod: LocalMod) => void;
  onDelete: (mod: LocalMod) => void;
}

export const HeroSoundsSection = ({
  title,
  hint,
  hero,
  mods,
  activeIds,
  disabled,
  onToggle,
  onRemove,
  onDelete,
}: HeroSoundsSectionProps) => (
  <section className='flex flex-col gap-3'>
    <HeroSectionHeader count={mods.length} hint={hint} title={title} />
    <div className='overflow-hidden rounded-lg border bg-card'>
      {mods.map((mod) => (
        <HeroSoundRow
          disabled={disabled}
          hero={hero}
          isActive={activeIds.has(mod.remoteId)}
          key={mod.remoteId}
          mod={mod}
          onDelete={() => onDelete(mod)}
          onRemove={() => onRemove(mod)}
          onToggle={() => onToggle(mod)}
        />
      ))}
    </div>
  </section>
);
