import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { PluginAccessSheet } from "@/components/plugins/access/access-sheet";
import {
  BlockedToast,
  useBlockedRequest,
} from "@/components/plugins/page/blocked-toast";
import { FinishSetup } from "@/components/plugins/page/finish-setup";
import { HostBar } from "@/components/plugins/page/host-bar";
import { type HostStatus } from "@/components/plugins/page/host-status";
import { NoAnswerState } from "@/components/plugins/page/no-answer-state";
import { NoPageState } from "@/components/plugins/page/no-page-state";
import { StartingArea } from "@/components/plugins/page/starting-area";
import { StoppedState } from "@/components/plugins/page/stopped-state";
import { TurnedOffState } from "@/components/plugins/page/turned-off-state";
import { UpdateBanner } from "@/components/plugins/page/update-banner";
import { UpdateSheet } from "@/components/plugins/page/update-sheet";
import {
  type FramePhase,
  usePluginFrame,
} from "@/components/plugins/page/use-plugin-frame";
import { WaitsForUpdateState } from "@/components/plugins/page/waits-for-update-state";
import {
  HOST_NEUTRAL,
  pageState,
  TONE_COLOR,
} from "@/components/plugins/plugin-status";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

const hostStatus = (
  plugin: ExternalPluginSummary,
  live: boolean,
  phase: FramePhase,
): HostStatus => {
  if (live && phase === "starting") {
    return { color: HOST_NEUTRAL, labelKey: "plugins.state.starting" };
  }
  if (live && phase === "noAnswer") {
    return { color: TONE_COLOR.danger, labelKey: "plugins.page.notResponding" };
  }
  const state = pageState(plugin);
  return {
    color: state.tone === "neutral" ? HOST_NEUTRAL : TONE_COLOR[state.tone],
    labelKey: state.labelKey,
  };
};

export const PluginPage = ({ plugin }: { plugin: ExternalPluginSummary }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [accessOpen, setAccessOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const live = plugin.status === "enabled" && plugin.hasUi;
  const frame = usePluginFrame(plugin.id, live);
  const blocked = useBlockedRequest(plugin.id);
  const update = plugin.pendingUpdate;
  const reviewRequested = searchParams.get("review") === "update";

  useEffect(() => {
    if (!reviewRequested) return;
    setUpdateOpen(true);
    setSearchParams(
      (params) => {
        params.delete("review");
        return params;
      },
      { replace: true },
    );
  }, [reviewRequested, setSearchParams]);

  const openUpdate = () => setUpdateOpen(true);

  const body = () => {
    switch (plugin.status) {
      case "needsConsent":
        return update ? (
          <WaitsForUpdateState
            onReview={openUpdate}
            plugin={plugin}
            version={update.version}
          />
        ) : (
          <FinishSetup plugin={plugin} />
        );
      case "disabled":
        return <TurnedOffState plugin={plugin} />;
      case "quarantined":
        return <StoppedState plugin={plugin} />;
      case "enabled":
        if (!plugin.hasUi) return <NoPageState plugin={plugin} />;
        return (
          <>
            {frame.src ? (
              <iframe
                className='min-h-0 w-full flex-1 border-0'
                key={frame.frameKey}
                ref={frame.frameRef}
                referrerPolicy='no-referrer'
                sandbox='allow-scripts'
                src={frame.src}
                style={{ colorScheme: frame.colorScheme }}
                title={plugin.name}
              />
            ) : null}
            {frame.phase === "ready" ? null : (
              <div className='absolute inset-0 flex flex-col bg-background'>
                {frame.phase === "starting" ? (
                  <StartingArea />
                ) : (
                  <NoAnswerState onReload={frame.reload} plugin={plugin} />
                )}
              </div>
            )}
          </>
        );
    }
  };

  return (
    <div className='relative flex h-full min-h-0 w-full flex-1 flex-col'>
      <HostBar
        onOpenAccess={() => setAccessOpen(true)}
        onReload={live ? frame.reload : undefined}
        plugin={plugin}
        showAccess={plugin.status !== "needsConsent"}
        status={hostStatus(plugin, live, frame.phase)}
      />
      {update ? (
        <UpdateBanner onReview={openUpdate} plugin={plugin} update={update} />
      ) : null}
      <div className='relative flex min-h-0 flex-1 flex-col'>
        {body()}
        {blocked.activity ? (
          <BlockedToast
            activity={blocked.activity}
            onDismiss={blocked.dismiss}
            onReviewAccess={() => {
              blocked.dismiss();
              setAccessOpen(true);
            }}
            plugin={plugin}
          />
        ) : null}
      </div>
      <PluginAccessSheet
        onOpenChange={setAccessOpen}
        open={accessOpen}
        plugin={plugin}
      />
      {update ? (
        <UpdateSheet
          onOpenChange={setUpdateOpen}
          open={updateOpen}
          plugin={plugin}
          update={update}
        />
      ) : null}
    </div>
  );
};
