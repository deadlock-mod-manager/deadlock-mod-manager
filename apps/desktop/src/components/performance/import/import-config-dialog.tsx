import logger from "@/lib/logger";
import { discardPerfStaging } from "@/lib/performance/api";
import {
  type ImportModContext,
  type PerfImportNavigationState,
} from "@/lib/performance/import/save";
import { Dialog, DialogContent } from "@deadlock-mods/ui/components/dialog";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { usePerformanceUi } from "../performance-context";
import { ImportDialogBody } from "./import-dialog-body";
import { type ImportSession } from "./import-session";

const emptySession = (): ImportSession => ({
  stagingIds: new Set(),
  keptStagingId: null,
});

/**
 * Import dialog for the Performance page. Opens from the page header, from
 * GameBanana config cards, and from the "this mod includes a performance
 * config" prompt, which hands its staged archive over through router state.
 */
export const ImportConfigDialog = () => {
  const { importOpen, importSource, openImport, closeImport } =
    usePerformanceUi();
  const location = useLocation();
  const navigate = useNavigate();
  const [modContext, setModContext] = useState<ImportModContext | null>(null);
  const session = useRef<ImportSession>(emptySession());

  const navigationState: PerfImportNavigationState | null = location.state;
  useEffect(() => {
    if (!navigationState?.importSource) return;
    setModContext(navigationState.importContext);
    openImport(navigationState.importSource);
    navigate(location.pathname, { replace: true, state: null });
  }, [navigationState, openImport, navigate, location.pathname]);

  const close = () => {
    const { stagingIds, keptStagingId } = session.current;
    for (const stagingId of stagingIds) {
      if (stagingId === keptStagingId) continue;
      discardPerfStaging(stagingId).catch((error) =>
        logger
          .withError(error)
          .warn("Discarding staged performance config failed"),
      );
    }
    session.current = emptySession();
    setModContext(null);
    closeImport();
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) close();
      }}
      open={importOpen}>
      <DialogContent className='flex h-[min(52rem,calc(100vh-5rem))] flex-col gap-0 p-0 sm:max-w-6xl'>
        <ImportDialogBody
          context={modContext}
          initialSource={importSource}
          key={JSON.stringify(importSource)}
          onClose={close}
          session={session}
        />
      </DialogContent>
    </Dialog>
  );
};
