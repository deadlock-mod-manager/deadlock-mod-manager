import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { useTranslation } from "react-i18next";
import type { FoundrySoundGroup } from "@/types/foundry";
import { SoundGroupItem } from "./foundry-sound-group-item";

export const GroupNav = ({
  groups,
  activeId,
  editedPaths,
  onSelect,
}: {
  groups: FoundrySoundGroup[];
  activeId: string | null;
  editedPaths: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const abilities = groups.filter((group) => group.kind === "ability");
  const rest = groups.filter((group) => group.kind !== "ability");

  return (
    <ScrollArea className='h-full'>
      <div className='space-y-0.5 px-2 py-3'>
        {abilities.length > 0 && (
          <p className='px-2 pt-2 pb-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
            {t("foundry.sounds.abilities")}
          </p>
        )}
        {abilities.map((group) => (
          <SoundGroupItem
            key={group.id}
            group={group}
            activeId={activeId}
            editedPaths={editedPaths}
            onSelect={onSelect}
          />
        ))}
        {rest.length > 0 && (
          <p className='px-2 pt-3 pb-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
            {t("foundry.sounds.hero")}
          </p>
        )}
        {rest.map((group) => (
          <SoundGroupItem
            key={group.id}
            group={group}
            activeId={activeId}
            editedPaths={editedPaths}
            onSelect={onSelect}
          />
        ))}
      </div>
    </ScrollArea>
  );
};
