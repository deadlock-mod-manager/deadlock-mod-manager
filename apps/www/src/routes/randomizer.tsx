import { Button } from "@deadlock-mods/ui/components/button";
import { RefreshCw } from "@deadlock-mods/ui/icons";
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { RandomizerView } from "@/components/randomizer/randomizer-view";
import { RollSkeleton } from "@/components/randomizer/roll-skeleton";
import { useRandomizer } from "@/hooks/use-randomizer";
import { decodeSeed, encodeSeed, randomSeed } from "@/lib/randomizer/rng";
import {
  decodeSections,
  encodeSections,
  type Sections,
} from "@/lib/randomizer/sections";
import { seo } from "@/utils/seo";

interface RandomizerSearch {
  s?: string;
  p?: string;
}

export const Route = createFileRoute("/randomizer")({
  component: RandomizerPage,
  validateSearch: (search: Record<string, unknown>): RandomizerSearch => ({
    s: typeof search.s === "string" ? search.s : undefined,
    p: typeof search.p === "string" ? search.p : undefined,
  }),
  head: () =>
    seo({
      title: "Randomizer | Deadlock Mod Manager",
      description:
        "Roll a random Deadlock hero, a legal item build in purchase order, an ability point order and three bravery rules. Share the seed, reroll as often as you like.",
      keywords:
        "deadlock randomizer, deadlock random build, deadlock ultimate bravery, random hero deadlock, deadlock build generator",
      url: "https://deadlockmods.app/randomizer",
      canonical: "https://deadlockmods.app/randomizer",
    }),
});

function RandomizerPage() {
  const search = useSearch({ from: "/randomizer" });
  const navigate = useNavigate();
  const seed = decodeSeed(search.s);
  const sections = decodeSections(search.p);

  // The seed lives in the URL so a roll is shareable and the browser's back
  // button walks previous rolls. Landing without one picks a fresh seed, which
  // has to happen on the client to keep the server and the first render in sync.
  useEffect(() => {
    if (seed === null) {
      void navigate({
        to: "/randomizer",
        search: { s: encodeSeed(randomSeed()), p: search.p },
        replace: true,
      });
    }
  }, [seed, search.p, navigate]);

  const { roll, abilities, isLoading, error, retry } = useRandomizer(seed ?? 0);

  const reroll = () => {
    void navigate({
      to: "/randomizer",
      search: { s: encodeSeed(randomSeed()), p: search.p },
    });
  };

  const setSections = (next: Sections) => {
    void navigate({
      to: "/randomizer",
      search: { s: search.s, p: encodeSections(next) },
      replace: true,
    });
  };

  if (error) {
    return (
      <div className='container mx-auto px-4 py-24 text-center'>
        <h1 className='font-bold font-primary text-3xl'>
          The roll could not be cast
        </h1>
        <p className='mt-3 text-muted-foreground'>
          Hero and item data comes from the Deadlock API, and it did not answer.
        </p>
        <Button className='mt-6' onClick={retry}>
          <RefreshCw className='size-4' />
          Try again
        </Button>
      </div>
    );
  }

  // Ability icons come from the same one-off asset load as the rest, so the
  // skeleton holds until every part of the roll can be drawn at once.
  if (seed === null || !roll || isLoading) {
    return <RollSkeleton />;
  }

  return (
    <RandomizerView
      abilities={abilities}
      onReroll={reroll}
      onSectionsChange={setSections}
      roll={roll}
      sections={sections}
    />
  );
}
