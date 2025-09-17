import type { ModDto } from '@deadlock-mods/utils';
import { useQuery } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { ModCard } from '@/components/mod-card';
import { ModPreview } from '@/components/mod-preview';
import { orpc } from '@/utils/orpc';

export const ModShowcaseSection = () => {
  const [selectedMod, setSelectedMod] = React.useState<string | null>(null);
  const modsQuery = useQuery(orpc.listModsV2.queryOptions());
  const mods = useMemo(
    () =>
      (modsQuery.data || [])
        .sort((a: ModDto, b: ModDto) => b.downloadCount - a.downloadCount)
        .slice(0, 4),
    [modsQuery.data]
  );

  React.useEffect(() => {
    if (mods.length > 0 && !selectedMod) {
      setSelectedMod(mods[0].id);
    }
  }, [mods, selectedMod]);
  const selectedModData = mods.find((mod) => mod.id === selectedMod);

  return (
    <section
      className="gear-pattern container relative mx-auto py-24 sm:py-32"
      id="showcase"
    >
      <div className="mx-auto mb-16 max-w-3xl text-center">
        <h2 className="mb-6 font-bold font-primary text-4xl md:text-5xl lg:text-6xl">
          <span className="text-foreground">Browse & Install</span>
          <br />
          <span className="deadlock-text-gradient">Mods in Seconds</span>
        </h2>

        <p className="text-muted-foreground text-xl leading-relaxed">
          Discover popular mods, check them out, and install with a single
          click. No complicated setup required.
        </p>

        <div className="deadlock-gradient-primary mx-auto mt-6 h-1 w-24 rounded-full" />
      </div>
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="space-y-4">
          <h3 className="mb-6 flex items-center gap-2 font-semibold text-xl">
            Popular Mods
          </h3>

          {mods.map((mod: ModDto) => (
            <ModCard
              isSelected={selectedMod === mod.id}
              key={mod.id}
              mod={mod}
              onClick={() => setSelectedMod(mod.id)}
            />
          ))}
        </div>

        <div className="lg:sticky lg:top-8">
          <ModPreview selectedMod={selectedModData || null} />
        </div>
      </div>
    </section>
  );
};
