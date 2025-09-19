import { createORPCClient } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useState } from "react";
import { Footer } from "@/components/footer";
import Loader from "@/components/loader";
import { Navbar } from "@/components/navbar";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { link, type orpc } from "@/utils/orpc";
import type { AppRouterClient } from "../../../api/src/routers";
import "../index.css";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title:
          "Deadlock Mod Manager - Download, Install & Manage Deadlock Mods",
      },
      {
        name: "description",
        content:
          "The ultimate mod manager for Valve's Deadlock game. Browse, download, and manage mods from GameBanana with automatic installation detection. Cross-platform support for Windows, macOS, and Linux.",
      },
      {
        name: "keywords",
        content:
          "deadlock mod manager, deadlock mods, valve deadlock, game mod manager, gamebanana mods, deadlock modding, tauri app, deadlock tools, valve games, mods installer, deadlock community",
      },
      {
        name: "author",
        content: "Stormix",
      },
      {
        name: "robots",
        content: "index, follow",
      },
      {
        name: "theme-color",
        content: "#d4af37",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:title",
        content:
          "Deadlock Mod Manager - Download, Install & Manage Deadlock Mods",
      },
      {
        property: "og:description",
        content:
          "The ultimate mod manager for Valve's Deadlock game. Browse, download, and manage mods from GameBanana with automatic installation detection. Cross-platform support for Windows, macOS, and Linux.",
      },
      {
        property: "og:image",
        content: "/og-image.png",
      },
      {
        property: "og:image:alt",
        content:
          "Deadlock Mod Manager - Interface showing mod browser and installation features",
      },
      {
        property: "og:site_name",
        content: "Deadlock Mod Manager",
      },
      {
        property: "twitter:card",
        content: "summary_large_image",
      },
      {
        property: "twitter:title",
        content:
          "Deadlock Mod Manager - Download, Install & Manage Deadlock Mods",
      },
      {
        property: "twitter:description",
        content:
          "The ultimate mod manager for Valve's Deadlock game. Browse, download, and manage mods from GameBanana with automatic installation detection.",
      },
      {
        property: "twitter:image",
        content: "/og-image.png",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.svg",
      },
      {
        rel: "canonical",
        href: "https://deadlock-mods.com/",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
    ],
  }),
});

function RootComponent() {
  const isFetching = useRouterState({
    select: (s) => s.isLoading,
  });

  const [client] = useState<AppRouterClient>(() => createORPCClient(link));
  const [_orpcUtils] = useState(() => createTanstackQueryUtils(client));

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute='class'
        defaultTheme='dark'
        disableTransitionOnChange
        storageKey='vite-ui-theme'>
        <div className='min-h-screen'>
          <Navbar />
          {isFetching ? <Loader /> : <Outlet />}
          <Footer />
        </div>
        <Toaster richColors />
      </ThemeProvider>
      <TanStackRouterDevtools position='bottom-left' />
      <ReactQueryDevtools buttonPosition='bottom-right' position='bottom' />
    </>
  );
}
