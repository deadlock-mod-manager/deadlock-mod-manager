import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
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
import { seo } from "@/utils/seo";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => {
    const baseSeo = seo({
      title: "Deadlock Mod Manager | Download, Install & Manage Deadlock Mods",
    });

    return {
      meta: [
        ...baseSeo.meta,
        {
          property: "og:image:width",
          content: "1200",
        },
        {
          property: "og:image:height",
          content: "630",
        },
        {
          property: "og:image:alt",
          content:
            "Deadlock Mod Manager - Interface showing mod browser and installation features",
        },
      ],
      links: [
        ...baseSeo.links,
        {
          rel: "stylesheet",
          href: appCss,
        },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Deadlock Mod Manager",
            description:
              "The ultimate mod manager for Valve's Deadlock game. Browse, download, and manage mods from GameBanana with automatic installation detection.",
            url: "https://deadlockmods.app/",
            downloadUrl:
              "https://github.com/stormix/deadlock-modmanager/releases/latest",
            author: {
              "@type": "Person",
              name: "Stormix",
              url: "https://github.com/Stormix",
            },
            operatingSystem: ["Windows", "macOS", "Linux"],
            applicationCategory: "GameApplication",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
            },
            screenshot: "/mods.png",
            softwareVersion: "latest",
            fileFormat: "application/x-executable",
            installUrl:
              "https://github.com/stormix/deadlock-modmanager/releases/latest",
            softwareRequirements: "Valve Deadlock Game",
            keywords: "deadlock, mod manager, valve, gaming, mods, gamebanana",
            license: "https://www.gnu.org/licenses/gpl-3.0.html",
            isAccessibleForFree: true,
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Deadlock Mod Manager",
            url: "https://deadlockmods.app",
            description: "The ultimate mod manager for Valve's Deadlock game",
            publisher: {
              "@type": "Organization",
              name: "Deadlock Mod Manager",
              logo: {
                "@type": "ImageObject",
                url: "https://deadlockmods.app/og-image.png",
              },
              url: "https://deadlockmods.app",
              sameAs: [
                "https://github.com/Stormix/deadlock-modmanager",
                "https://discord.gg/deadlockmods",
              ],
            },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: "https://deadlockmods.app/",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Download",
                item: "https://deadlockmods.app/download",
              },
              {
                "@type": "ListItem",
                position: 3,
                name: "Docs",
                item: "https://deadlockmods.app/docs",
              },
              {
                "@type": "ListItem",
                position: 4,
                name: "Documentation",
                item: "https://docs.deadlockmods.app/",
              },
              {
                "@type": "ListItem",
                position: 5,
                name: "VPK Analyzer",
                item: "https://deadlockmods.app/vpk-analyzer",
              },
              {
                "@type": "ListItem",
                position: 6,
                name: "Status",
                item: "https://deadlockmods.app/status",
              },
            ],
          }),
        },
      ],
    };
  },

  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  const fullscreenRoutes = ["/login", "/auth/desktop-callback"];
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
        <Scripts />
      </body>
    </html>
  );
}
