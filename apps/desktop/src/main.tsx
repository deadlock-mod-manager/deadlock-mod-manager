// oxlint-disable import/no-unassigned-import
import { QueryClientProvider } from "@tanstack/react-query";
import React, { type ReactNode, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import App from "./app";
import { useExperimentalFeature } from "./hooks/use-experimental-feature";
import { useFeatureEnabled } from "./hooks/use-feature-enabled";
import { queryClient } from "./lib/client";
import type { OptionalFeature } from "./lib/features";
import AddMods from "./pages/add-mods";
import Author from "./pages/author";
import Collection from "./pages/collection";
import Crosshairs from "./pages/crosshairs";
import Dashboard from "./pages/dashboard";
import Debug from "./pages/debug";
import { DebugViewer } from "./pages/debug-viewer";
import Contributors from "./pages/contributors";
import Developer from "./pages/developer";
import Downloads from "./pages/downloads";
import Foundry from "./pages/foundry";

import Mod from "./pages/mod";
import Performance from "./pages/performance";
import GetMods, { GetMaps } from "./pages/mods";
import MyMods from "./pages/my-mods";
import ExternalPluginPage from "./pages/external-plugin";
import PluginEntry from "./pages/plugin";
import ManagePlugins from "./pages/plugins-manage";
import Servers from "./pages/servers";
import ServerPicker from "./pages/server-picker";
import CustomSettings from "./pages/settings";
import Skins from "./pages/skins";
import Splash from "./pages/splash";
import Stats from "./pages/stats";
import StatsMatch from "./pages/stats-match";
import "flag-icons/css/flag-icons.min.css";
import "./index.css";
import "./lib/i18n";
import { initializeApplication } from "./lib/application-bootstrap";

if (import.meta.env.VITE_DMM_E2E_HARNESS === "1") {
  await import("@wdio/tauri-plugin");
}

const application = await initializeApplication();

const MapsRouteGate = () => {
  const isEnabled = useExperimentalFeature("custom-maps");
  if (!isEnabled) {
    return <Navigate replace to='/mods' />;
  }
  return <GetMaps />;
};

const FeatureRouteGate = ({
  feature,
  children,
}: {
  feature: OptionalFeature;
  children: ReactNode;
}) => {
  const isEnabled = useFeatureEnabled(feature);
  if (!isEnabled) {
    return <Navigate replace to='/' />;
  }
  return children;
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<Splash />}>
        <BrowserRouter>
          <Routes>
            {import.meta.env.DEV && (
              <Route element={<DebugViewer />} path='/debug/viewer/:modId?' />
            )}
            <Route
              element={
                <App
                  runtime={application.runtime}
                  storage={application.storage}
                />
              }>
              <Route element={<Dashboard />} path='/' />
              <Route element={<MyMods />} path='/my-mods' />
              <Route element={<GetMods />} path='/mods' />

              <Route element={<MapsRouteGate />} path='/maps' />
              <Route element={<Mod />} path='/mods/:id' />
              <Route element={<Author />} path='/authors/:id' />
              <Route element={<Collection />} path='/collections/:id' />
              <Route element={<AddMods />} path='/add-mods' />
              <Route element={<Downloads />} path='/downloads' />
              <Route
                element={
                  <FeatureRouteGate feature='server-browser'>
                    <Servers />
                  </FeatureRouteGate>
                }
                path='/servers'
              />
              <Route
                element={
                  <FeatureRouteGate feature='server-picker'>
                    <ServerPicker />
                  </FeatureRouteGate>
                }
                path='/server-picker'
              />
              <Route element={<CustomSettings />} path='/settings' />
              <Route element={<Contributors />} path='/contributors' />
              <Route element={<Developer />} path='/developer' />
              <Route
                element={
                  <FeatureRouteGate feature='plugins'>
                    <ManagePlugins />
                  </FeatureRouteGate>
                }
                path='/plugins/manage'
              />
              <Route
                element={
                  <FeatureRouteGate feature='plugins'>
                    <PluginEntry />
                  </FeatureRouteGate>
                }
                path='/plugins/:id'
              />
              <Route
                element={
                  <FeatureRouteGate feature='plugins'>
                    <ExternalPluginPage />
                  </FeatureRouteGate>
                }
                path='/ext/:pluginId'
              />
              <Route element={<Debug />} path='/debug' />
              <Route
                element={
                  <FeatureRouteGate feature='crosshairs'>
                    <Crosshairs />
                  </FeatureRouteGate>
                }
                path='/crosshairs'
              />
              <Route
                element={
                  <FeatureRouteGate feature='skins'>
                    <Skins />
                  </FeatureRouteGate>
                }
                path='/skins'
              />
              <Route
                element={
                  <FeatureRouteGate feature='stats'>
                    <Stats />
                  </FeatureRouteGate>
                }
                path='/stats'
              />
              <Route
                element={
                  <FeatureRouteGate feature='stats'>
                    <StatsMatch />
                  </FeatureRouteGate>
                }
                path='/stats/matches/:matchId'
              />
              <Route
                element={
                  <FeatureRouteGate feature='foundry'>
                    <Foundry />
                  </FeatureRouteGate>
                }
                path='/foundry'
              />
              <Route
                element={
                  <FeatureRouteGate feature='performance'>
                    <Performance />
                  </FeatureRouteGate>
                }
                path='/performance'
              />
              <Route
                element={<CustomSettings value='autoexec' />}
                path='/settings/autoexec'
              />
              <Route
                element={<CustomSettings value='experimental' />}
                path='/settings/experimental'
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </Suspense>
    </QueryClientProvider>
  </React.StrictMode>,
);
