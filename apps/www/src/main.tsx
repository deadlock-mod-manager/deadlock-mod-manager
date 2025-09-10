import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import ReactDOM from 'react-dom/client';
import Loader from './components/loader';
import { routeTree } from './routeTree.gen';
import { orpc, queryClient } from './utils/orpc';

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPendingComponent: () => <Loader />,
  context: { orpc, queryClient },
  Wrap({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('app');

if (!rootElement) {
  throw new Error('Root element not found');
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}
