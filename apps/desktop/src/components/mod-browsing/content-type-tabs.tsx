import { Tabs, TabsList, TabsTrigger } from "@deadlock-mods/ui/components/tabs";
import {
  BarricadeIcon,
  CardsThreeIcon,
  CubeIcon,
  type Icon,
  MapTrifoldIcon,
  MusicNotesIcon,
} from "@phosphor-icons/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { ContentType } from "@/lib/store/slices/ui";
import { cn } from "@/lib/utils";

const CONTENT_TYPES: { value: ContentType; Icon: Icon }[] = [
  { value: "mod", Icon: CubeIcon },
  { value: "sound", Icon: MusicNotesIcon },
  { value: "collection", Icon: CardsThreeIcon },
  { value: "map", Icon: MapTrifoldIcon },
  { value: "wip", Icon: BarricadeIcon },
];

type ContentTypeTabsProps = {
  value: ContentType;
  onChange: (value: ContentType) => void;
  showMaps: boolean;
  className?: string;
};

// Section tabs for the store header. The active tab's underline sits on the
// header's bottom hairline.
const ContentTypeTabs = ({
  value,
  onChange,
  showMaps,
  className,
}: ContentTypeTabsProps) => {
  const { t } = useTranslation();

  return (
    <Tabs
      className={className}
      onValueChange={(next) => onChange(next as ContentType)}
      value={value}>
      <TabsList
        aria-label={t("filters.contentType")}
        className='h-auto gap-1 rounded-none bg-transparent p-0'>
        {CONTENT_TYPES.filter((type) => showMaps || type.value !== "map").map(
          ({ value: type, Icon }) => (
            <TabsTrigger
              className={cn(
                "relative h-9 gap-2 rounded-md px-3 text-muted-foreground hover:text-foreground",
                "data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
                "after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity",
                "hover:after:opacity-30 data-[state=active]:after:opacity-100",
              )}
              key={type}
              value={type}>
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  type === value && "text-primary",
                )}
                weight='duotone'
              />
              {t(`filters.contentTypes.${type}`)}
            </TabsTrigger>
          ),
        )}
      </TabsList>
    </Tabs>
  );
};

export default memo(ContentTypeTabs);
