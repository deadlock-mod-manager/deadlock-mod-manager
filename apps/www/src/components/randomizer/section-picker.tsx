import { SECTION_KEYS, type Sections } from "@/lib/randomizer/sections";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { ChevronDown, SlidersHorizontal } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

export const SectionPicker = ({
  sections,
  onChange,
}: {
  sections: Sections;
  onChange: (sections: Sections) => void;
}) => {
  const { t } = useTranslation("tool-randomizer");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size='sm' variant='outline'>
          <SlidersHorizontal className='size-4' />
          {t("sections.trigger")}
          <ChevronDown className='size-3.5 opacity-60' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-52'>
        <DropdownMenuLabel>{t("sections.label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SECTION_KEYS.map((key) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={sections[key]}
            onCheckedChange={(checked) =>
              onChange({ ...sections, [key]: checked === true })
            }
            onSelect={(event) => event.preventDefault()}>
            {t(`sections.options.${key}`)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
