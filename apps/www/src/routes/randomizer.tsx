import { Button } from "@deadlock-mods/ui/components/button";
import { RefreshCw } from "@deadlock-mods/ui/icons";
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RandomizerView } from "@/components/randomizer/randomizer-view";
import { RollSkeleton } from "@/components/randomizer/roll-skeleton";
import { useRandomizer } from "@/hooks/use-randomizer";
import { headI18n } from "@/lib/i18n/route";
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
  h?: string;
}

export const Route = createFileRoute("/randomizer")({
  component: RandomizerPage,
  validateSearch: (search: Record<string, unknown>): RandomizerSearch => ({
    s: typeof search.s === "string" ? search.s : undefined,
    p: typeof search.p === "string" ? search.p : undefined,
    h: typeof search.h === "string" ? search.h : undefined,
  }),
  head: ({ match }) => {
    const { t, locale } = headI18n(match, "tool-randomizer");
    return seo({
      title: t("meta.title"),
      description: t("meta.description"),
      keywords: t("meta.keywords"),
      path: "/randomizer",
      locale,
    });
  },
});

function RandomizerPage() {
  const { t } = useTranslation("tool-randomizer");
  const search = useSearch({ from: "/randomizer" });
  const navigate = useNavigate();
  const seed = decodeSeed(search.s);
  const sections = decodeSections(search.p);

  useEffect(() => {
    if (seed === null) {
      void navigate({
        to: "/randomizer",
        search: { s: encodeSeed(randomSeed()), p: search.p, h: search.h },
        replace: true,
      });
    }
  }, [seed, search.p, search.h, navigate]);

  const { roll, heroes, abilities, isLoading, error, retry } = useRandomizer(
    seed ?? 0,
    search.h,
  );

  const reroll = () => {
    void navigate({
      to: "/randomizer",
      search: { s: encodeSeed(randomSeed()), p: search.p, h: search.h },
    });
  };

  const setSections = (next: Sections) => {
    void navigate({
      to: "/randomizer",
      search: { s: search.s, p: encodeSections(next), h: search.h },
      replace: true,
    });
  };

  const setHero = (slug: string | undefined) => {
    void navigate({
      to: "/randomizer",
      search: { s: encodeSeed(randomSeed()), p: search.p, h: slug },
    });
  };

  if (error) {
    return (
      <div className='container mx-auto px-4 py-24 text-center'>
        <h1 className='font-bold font-primary text-3xl'>{t("error.title")}</h1>
        <p className='mt-3 text-muted-foreground'>{t("error.description")}</p>
        <Button className='mt-6' onClick={retry}>
          <RefreshCw className='size-4' />
          {t("error.retry")}
        </Button>
      </div>
    );
  }

  if (seed === null || !roll || isLoading) {
    return <RollSkeleton />;
  }

  return (
    <RandomizerView
      abilities={abilities}
      heroes={heroes}
      lockedHero={search.h}
      onHeroChange={setHero}
      onReroll={reroll}
      onSectionsChange={setSections}
      roll={roll}
      sections={sections}
    />
  );
}
