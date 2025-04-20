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
import Downloads from './pages/downloads';
import Mod from './pages/mod';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<Splash />}>
        <BrowserRouter>
          <Routes>
            <Route element={<App />}>
              <Route path="/" element={<MyMods />} />
              <Route path="/mods" element={<GetMods />} />
              <Route path="/mods/:id" element={<Mod />} />
              <Route path="/downloads" element={<Downloads />} />
              <Route path="/settings" element={<CustomSettings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </Suspense>
    </QueryClientProvider>
  </React.StrictMode>
);
