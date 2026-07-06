// oxlint-disable import/no-unassigned-import
import { QueryClientProvider } from "@tanstack/react-query";
import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import App from "./app";
import {
  useFeatureFlag,
  usePlayerStatsEnabled,
} from "./hooks/use-feature-flags";
import { queryClient } from "./lib/client";
import AddMods from "./pages/add-mods";
import Crosshairs from "./pages/crosshairs";
import Dashboard from "./pages/dashboard";
import Debug from "./pages/debug";
import Developer from "./pages/developer";
import Downloads from "./pages/downloads";
import Foundry from "./pages/foundry";

import Mod from "./pages/mod";
import GetMods, { GetMaps } from "./pages/mods";
import MyMods from "./pages/my-mods";
import PluginEntry from "./pages/plugin";
import Servers from "./pages/servers";
import CustomSettings from "./pages/settings";
import Skins from "./pages/skins";
import Splash from "./pages/splash";
import Stats from "./pages/stats";
import "flag-icons/css/flag-icons.min.css";
import "./index.css";
import "./lib/i18n";

const MapsRouteGate = () => {
  const { isEnabled } = useFeatureFlag("custom-maps", false);
  if (!isEnabled) {
    return <Navigate replace to='/mods' />;
  }
  return <GetMaps />;
};

const StatsRouteGate = () => {
  // On by default, so an unanswered flag request renders the page rather than
  // bouncing anyone who opens /stats on a cold start - no pending state needed.
  const { isEnabled } = usePlayerStatsEnabled();
  if (!isEnabled) {
    return <Navigate replace to='/' />;
  }
  return <Stats />;
};

const ServersRouteGate = () => {
  const { isEnabled } = useFeatureFlag("server-browser", false);
  if (!isEnabled) {
    return <Navigate replace to='/' />;
  }
  return <Servers />;
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<Splash />}>
        <BrowserRouter>
          <Routes>
            <Route element={<App />}>
              <Route element={<Dashboard />} path='/' />
              <Route element={<MyMods />} path='/my-mods' />
              <Route element={<GetMods />} path='/mods' />

              <Route element={<MapsRouteGate />} path='/maps' />
              <Route element={<Mod />} path='/mods/:id' />
              <Route element={<AddMods />} path='/add-mods' />
              <Route element={<Downloads />} path='/downloads' />
              <Route element={<ServersRouteGate />} path='/servers' />
              <Route element={<CustomSettings />} path='/settings' />
              <Route element={<Developer />} path='/developer' />
              <Route element={<PluginEntry />} path='/plugins/:id' />
              <Route element={<Debug />} path='/debug' />
              <Route element={<Crosshairs />} path='/crosshairs' />
              <Route element={<Skins />} path='/skins' />
              <Route element={<StatsRouteGate />} path='/stats' />
              <Route element={<Foundry />} path='/foundry' />
              <Route
                element={<CustomSettings value='autoexec' />}
                path='/settings/autoexec'
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </Suspense>
    </QueryClientProvider>
  </React.StrictMode>,
);
