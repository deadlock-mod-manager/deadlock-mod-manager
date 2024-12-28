import { Navbar } from "@/components/navbar";
import "../globals.css";

import { Footer } from "@/components/footer";
import { ThemeProvider } from "@/components/theme-provider";
import { SITE_URL } from "@/lib/constants";
import { cn, getLatestVersion } from "@/lib/utils";
import { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from 'next/font/local';

const forevs = localFont({
  src: [
    {
      path: '../assets/fonts/primary/forevsdemo-medium.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../assets/fonts/primary/forevsdemo-bold.otf',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-forevs',
 })

 const inter = Inter({ subsets: ["latin"] });
 export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}




export async function generateMetadata(): Promise<Metadata> {
  const version = await getLatestVersion();
  
  return {
    metadataBase: new URL(SITE_URL),
    title: `Download | Deadlock Mod Manager (v${version})`,
    description: "The official mod manager for Deadlock. Download, install, and manage your Deadlock mods and skins with ease. Browse community-created content and customize your game experience.",
    keywords: [
      "deadlock",
      "mod manager",
      "game mods",
      "deadlock mods",
      "skin installer",
      "game customization",
      "mod installer",
      "deadlock skins",
      "game modifications",
      "mod management tool",
      "deadlock customization",
      "gaming",
      "steam mods",
      "game enhancement",
      "mod loader"
    ],
    authors: [
      {
        name: "Stormix",
        url: "https://github.com/Stormix"
      }
    ],
    creator: "Stormix",
    publisher: "Stormix",
    applicationName: "Deadlock Mod Manager",
    robots: "index, follow",
    openGraph: {
      type: "website",
      locale: "en_US",
      url: "https://deadlockmods.app",
      title: `Deadlock Mod Manager v${version} - Easy Mod Installation & Management`,
      description: "The official mod manager for Deadlock. Easily browse, install and manage mods and skins for your game. Enhance your gaming experience with community-created content.",
      siteName: "Deadlock Mod Manager",
      images: [{
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Deadlock Mod Manager Preview"
      }]
    },
    twitter: {
      card: "summary_large_image",
      title: `Deadlock Mod Manager v${version} - Easy Mod Installation & Management`,
      description: "The official mod manager for Deadlock. Easily browse, install and manage mods and skins for your game.",
      images: ["/og-image.png"],
      creator: "@stormix_dev"
    }
  };
}

const RootLayout: React.FC<{
  children: React.ReactNode;
}> = ({
  children,
}) => {
  return (
    <>
      <html lang="en" suppressHydrationWarning>
        <head>
          <link rel="icon" href="/favicon.svg" sizes="any" />
        </head>
        
        <body className={cn(inter.className, forevs.variable, "min-h-screen")}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            disableTransitionOnChange
          >
            <Navbar />
            {children}
            <Footer />
          </ThemeProvider>
        </body>
      </html>
    </>
  );
}

export default RootLayout;