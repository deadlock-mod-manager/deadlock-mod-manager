import { TanStackDevtools } from "@tanstack/react-devtools";
import { isServer, type QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { FullscreenLayout } from "@/components/layouts/fullscreen-layout";
import { MainLayout } from "@/components/layouts/main-layout";
import { ThemeProvider } from "@/components/theme-provider";
import { sessionQueryOptions } from "@/hooks/use-oidc-session";
import { prefetchWithin } from "@/lib/prefetch";
import { siteHead } from "@/utils/seo";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  // Resolve the session while server-rendering so the navbar's account menu
  // hydrates in its final state. In the browser the query refreshes itself.
  loader: async ({ context: { queryClient } }) => {
    if (isServer) {
      await prefetchWithin(queryClient, sessionQueryOptions, 1000);
    }
  },
  head: () => {
    const site = siteHead();
    return {
      meta: site.meta,
      links: [...site.links, { rel: "stylesheet", href: appCss }],
    };
  },

  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  const fullscreenRoutes = ["/login"];
  const isFullscreenRoute = fullscreenRoutes.includes(pathname);
  const isDashboardRoute = pathname.startsWith("/dashboard");

  return (
    <html
      lang='en'
      className='dark'
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {/* Inside <body>: next-themes renders an inline <script>, which React
            cannot place when the provider wraps the <html> element itself. */}
        <ThemeProvider
          attribute='class'
          defaultTheme='dark'
          disableTransitionOnChange
          enableSystem={false}
          storageKey='vite-ui-theme'>
          {isFullscreenRoute ? (
            <FullscreenLayout>{children}</FullscreenLayout>
          ) : isDashboardRoute ? (
            <DashboardLayout>{children}</DashboardLayout>
          ) : (
            <MainLayout>{children}</MainLayout>
          )}
          {import.meta.env.DEV && (
            <TanStackDevtools
              config={{
                position: "bottom-right",
              }}
              plugins={[
                {
                  name: "Tanstack Router",
                  render: <TanStackRouterDevtoolsPanel />,
                },
                TanStackQueryDevtools,
              ]}
            />
          )}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
