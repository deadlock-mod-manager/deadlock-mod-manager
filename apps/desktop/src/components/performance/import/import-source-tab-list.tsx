import { TabsList, TabsTrigger } from "@deadlock-mods/ui/components/tabs";
import { useTranslation } from "react-i18next";
import { SOURCE_TABS } from "./source-tabs";

/** Rendered by the dialog across both columns; must sit inside its `Tabs` root. */
export const ImportSourceTabList = () => {
  const { t } = useTranslation();
  return (
    <TabsList className='h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent px-5 py-2'>
      {SOURCE_TABS.map(({ value, icon: Icon }) => (
        <TabsTrigger
          className='h-8 gap-2 px-3 text-muted-foreground hover:text-foreground data-[state=active]:bg-muted data-[state=active]:shadow-none'
          key={value}
          value={value}>
          <Icon className='size-4 shrink-0' />
          {t(`performance.import.tabs.${value}`)}
        </TabsTrigger>
      ))}
    </TabsList>
  );
};
