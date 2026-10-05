import { cn } from "@deadlock-mods/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { LaunchOverlay, useLaunchSequence } from "./launch";
import { OccultGeometry } from "./occult-geometry";
import { PreviewStateProvider, usePreviewState } from "./preview-state";
import {
  CrosshairsScreen,
  ImageScreen,
  ServersScreen,
  SkinsScreen,
} from "./screens-customize";
import {
  DashboardScreen,
  DownloadsScreen,
  LibraryScreen,
  StoreScreen,
} from "./screens-mods";
import { SettingsScreen } from "./screens-settings";
import { BottomBar, PreviewToast, Sidebar, Titlebar } from "./shell";
import { type ScreenId, usePreviewNavigation } from "./store";
import { getPreviewTheme, themeStyle } from "./themes";

// The preview is laid out at desktop size and scaled down on narrow screens.
const BASE_WIDTH = 1232;
const BASE_HEIGHT = 760;

const SCREENS = {
  dashboard: () => <DashboardScreen />,
  downloads: () => <DownloadsScreen />,
  settings: () => <SettingsScreen />,
  library: () => <LibraryScreen />,
  store: () => <StoreScreen />,
  servers: () => <ServersScreen />,
  crosshairs: () => <CrosshairsScreen />,
  skins: () => <SkinsScreen />,
  foundry: () => <ImageScreen screen='foundry' />,
  autoexec: () => <ImageScreen screen='autoexec' />,
  stats: () => <ImageScreen screen='stats' />,
} satisfies Record<ScreenId, () => React.ReactNode>;

const useFitScale = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / BASE_WIDTH));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, scale };
};

const PreviewWindow = () => {
  const { screen, theme: themeId } = usePreviewNavigation();
  const { appearance } = usePreviewState();
  const [collapsed, setCollapsed] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const theme = getPreviewTheme(themeId);
  const launch = useLaunchSequence(screen);

  // Each screen starts at the top, like navigating in the app.
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [screen]);

  return (
    <div
      data-app-preview=''
      className={cn(
        "relative isolate flex size-full flex-col overflow-hidden rounded-xl border border-border-strong bg-background font-sans text-foreground text-left",
        theme.transparentChrome && "theme-chrome-clear",
        `theme-${theme.id}`,
      )}
      style={themeStyle(theme)}>
      {theme.backdrop && (
        <div
          aria-hidden='true'
          className='absolute inset-0 -z-10'
          style={theme.backdrop}
        />
      )}
      {!theme.hideGeometry && appearance.geometry && (
        <OccultGeometry
          className={appearance.animateGeometry ? undefined : "occult-static"}
        />
      )}
      <div className='relative z-[2] flex min-h-0 flex-1 flex-col'>
        <Titlebar
          launchState={launch.state}
          enabledCount={launch.enabledCount}
          onLaunch={launch.launch}
          onStop={launch.stop}
        />
        <div className='relative flex min-h-0 flex-1'>
          <Sidebar
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((value) => !value)}
          />
          <main
            ref={mainRef}
            className='min-w-0 flex-1 overflow-y-auto [scrollbar-color:hsl(var(--primary)/0.3)_transparent] [scrollbar-width:thin]'>
            <div
              key={screen}
              className='flex min-h-full animate-dl-rise flex-col'>
              {SCREENS[screen]()}
            </div>
          </main>
          <LaunchOverlay state={launch.state} />
        </div>
        <BottomBar />
      </div>
      <PreviewToast />
    </div>
  );
};

export const AppPreview = () => {
  const { ref, scale } = useFitScale();

  return (
    <div ref={ref} className='w-full'>
      <div
        className='relative overflow-hidden'
        style={{ height: BASE_HEIGHT * scale }}>
        <div
          className='absolute top-0 left-0 origin-top-left'
          style={{
            width: BASE_WIDTH,
            height: BASE_HEIGHT,
            transform: scale < 1 ? `scale(${scale})` : undefined,
          }}>
          <PreviewStateProvider>
            <PreviewWindow />
          </PreviewStateProvider>
        </div>
      </div>
    </div>
  );
};
