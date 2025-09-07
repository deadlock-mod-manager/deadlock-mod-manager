import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from 'react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import App from './app';
import { queryClient } from './lib/client';
import GetMods from './pages/mods';
import MyMods from './pages/my-mods';
import CustomSettings from './pages/settings';
import Splash from './pages/splash';

import './index.css';
import './lib/i18n';
import Downloads from './pages/downloads';
import Mod from './pages/mod';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<Splash />}>
        <BrowserRouter>
          <Routes>
            <Route element={<App />}>
              <Route element={<MyMods />} path="/" />
              <Route element={<GetMods />} path="/mods" />
              <Route element={<Mod />} path="/mods/:id" />
              <Route element={<Downloads />} path="/downloads" />
              <Route element={<CustomSettings />} path="/settings" />
            </Route>
          </Routes>
        </BrowserRouter>
      </Suspense>
    </QueryClientProvider>
  </React.StrictMode>
);
