import { load } from '@tauri-apps/plugin-store';
import usePromise from 'react-promise-suspense';
import { QueryClientProvider } from 'react-query';
import { Outlet } from 'react-router';
import { AppProvider } from './components/providers/app';
import { ThemeProvider } from './components/providers/theme';
import { TooltipProvider } from './components/ui/tooltip';
import { fetchAboutData } from './hooks/use-about';
import { Layout } from './layout';
import { queryClient } from './lib/client';
import { STORE_NAME } from './lib/constants';
import logger from './lib/logger';
import { usePersistedStore } from './lib/store';
import { cn } from './lib/utils';

const App = () => {
  const hydrateStore = async () => {
    await queryClient.prefetchQuery('about', fetchAboutData);
    await load(STORE_NAME, { autoSave: true });
    await usePersistedStore.persist.rehydrate();
    logger.info('Store rehydrated');
  };

  usePromise(hydrateStore, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="deadlock-theme">
        <AppProvider>
          <TooltipProvider>
            <Layout>
              <div className={cn('flex p-8')}>
                <Outlet />
              </div>
            </Layout>
          </TooltipProvider>
        </AppProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
