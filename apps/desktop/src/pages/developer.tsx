import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import { Layers } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ShardDiagnostics from "@/components/developer/shard-diagnostics";
import PageTitle from "@/components/shared/page-title";
import { cn } from "@/lib/utils";

const DeveloperNavItem = ({
  value,
  icon: Icon,
  label,
}: {
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) => (
  <TabsTrigger
    className={cn(
      "relative h-10 w-full justify-start gap-3 rounded-md px-3 py-2 font-medium text-sm",
      "text-muted-foreground transition-colors",
      "data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground",
      "data-[state=active]:bg-primary/10 data-[state=active]:text-foreground",
      "data-[state=active]:before:absolute data-[state=active]:before:left-0 data-[state=active]:before:top-1/2 data-[state=active]:before:h-5 data-[state=active]:before:w-[2px] data-[state=active]:before:-translate-y-1/2 data-[state=active]:before:rounded-r-full data-[state=active]:before:bg-primary",
    )}
    value={value}>
    <Icon className='h-4 w-4 shrink-0' />
    {label}
  </TabsTrigger>
);

const Developer = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("shards");

  return (
    <div className='flex min-h-0 w-full flex-col gap-4'>
      <PageTitle
        className='px-4'
        subtitle={t("developer.description")}
        title={t("navigation.developer")}
      />

      <Tabs
        className='flex min-h-0 flex-1 gap-6 overflow-hidden px-4'
        onValueChange={setActiveTab}
        value={activeTab}>
        <div className='w-56 shrink-0'>
          <TabsList className='h-fit w-full flex-col items-stretch gap-1 bg-transparent p-2'>
            <DeveloperNavItem
              icon={Layers}
              label={t("developer.shards.navLabel")}
              value='shards'
            />
          </TabsList>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-1 pr-4'>
          <TabsContent className='mt-0 space-y-4' value='shards'>
            <ShardDiagnostics />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default Developer;
