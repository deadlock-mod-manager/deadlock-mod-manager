import { type DeadlockHero, heroImage, heroSlug } from "@/lib/deadlock-assets";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { ChevronDown, UserRound } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

const ANY_HERO = "any";

export const HeroPicker = ({
  heroes,
  locked,
  onChange,
}: {
  heroes: DeadlockHero[];
  locked?: DeadlockHero;
  onChange: (slug: string | undefined) => void;
}) => {
  const { t } = useTranslation("tool-randomizer");
  const sorted = [...heroes].sort((a, b) => a.name.localeCompare(b.name));
  const lockedIcon = locked ? heroImage(locked, "small") : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size='sm' variant='outline'>
          {lockedIcon ? (
            <img alt='' className='size-4 object-contain' src={lockedIcon} />
          ) : (
            <UserRound className='size-4' />
          )}
          {locked ? locked.name : t("heroPicker.anyHero")}
          <ChevronDown className='size-3.5 opacity-60' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='max-h-[min(28rem,70vh)] w-56 overflow-y-auto'>
        <DropdownMenuLabel>{t("heroPicker.label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          onValueChange={(value) =>
            onChange(value === ANY_HERO ? undefined : value)
          }
          value={locked ? heroSlug(locked) : ANY_HERO}>
          <DropdownMenuRadioItem value={ANY_HERO}>
            {t("heroPicker.anyHero")}
          </DropdownMenuRadioItem>
          {sorted.map((hero) => {
            const icon = heroImage(hero, "small");
            return (
              <DropdownMenuRadioItem key={hero.id} value={heroSlug(hero)}>
                {icon ? (
                  <img
                    alt=''
                    className='size-5 object-contain'
                    loading='lazy'
                    src={icon}
                  />
                ) : null}
                {hero.name}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
