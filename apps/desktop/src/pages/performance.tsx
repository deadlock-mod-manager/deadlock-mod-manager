import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActiveConfigStatus,
  CatalogBehindNotice,
} from "@/components/performance/active-config-status";
import { ConfigDetailsSheet } from "@/components/performance/config-details-sheet";
import { ConfigsTab } from "@/components/performance/configs-tab";
import { HistoryTab } from "@/components/performance/history-tab";
import { HowItWorksTab } from "@/components/performance/how-it-works-tab";
import { ImportConfigDialog } from "@/components/performance/import/import-config-dialog";
import { PerformanceHeader } from "@/components/performance/performance-header";
import {
  isPerformanceTab,
  PerformanceUiProvider,
  usePerformanceUi,
} from "@/components/performance/performance-context";
import { SettingsEditorTab } from "@/components/performance/settings-editor/settings-editor-tab";

const PerformancePage = () => {
  const { t } = useTranslation();
  const { tab, setTab } = usePerformanceUi();
  // The editor is costly to mount, so once opened it stays mounted (hidden)
  // across tab switches.
  const [editorOpened, setEditorOpened] = useState(tab === "editor");
  if (tab === "editor" && !editorOpened) setEditorOpened(true);

  return (
    <div className='w-full overflow-y-auto px-5 pb-6'>
      <PerformanceHeader />
      <ActiveConfigStatus />
      <CatalogBehindNotice />
      <Tabs
        className='mt-6'
        onValueChange={(value) => {
          if (isPerformanceTab(value)) setTab(value);
        }}
        value={tab}>
        <TabsList>
          <TabsTrigger value='configs'>
            {t("performance.tabs.configs")}
          </TabsTrigger>
          <TabsTrigger value='editor'>
            {t("performance.tabs.editor")}
          </TabsTrigger>
          <TabsTrigger value='history'>
            {t("performance.tabs.history")}
          </TabsTrigger>
          <TabsTrigger value='howItWorks'>
            {t("performance.tabs.howItWorks")}
          </TabsTrigger>
        </TabsList>
        <TabsContent className='mt-5' value='configs'>
          <ConfigsTab />
        </TabsContent>
        <TabsContent
          className='mt-5 data-[state=inactive]:hidden'
          forceMount={editorOpened || undefined}
          value='editor'>
          <SettingsEditorTab />
        </TabsContent>
        <TabsContent className='mt-5' value='history'>
          <HistoryTab />
        </TabsContent>
        <TabsContent className='mt-5' value='howItWorks'>
          <HowItWorksTab />
        </TabsContent>
      </Tabs>
      <ImportConfigDialog />
      <ConfigDetailsSheet />
    </div>
  );
};

const Performance = () => (
  <PerformanceUiProvider>
    <PerformancePage />
  </PerformanceUiProvider>
);

export default Performance;
