import "@/app/global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

const inter = Inter({
  subsets: ["latin"],
});

interface LayoutProps {
  children: ReactNode;
}

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === "production"
      ? "https://docs.deadlockmods.app"
      : "http://localhost:3002",
  ),
  title: {
    template: "%s - Deadlock Mod Manager Docs",
    default: "Deadlock Mod Manager Documentation",
  },
  description:
    "Complete documentation for Deadlock Mod Manager - installation, usage, troubleshooting, and development guides.",
  keywords: [
    "Deadlock",
    "Deadlock mods",
    "mod manager",
    "game mods",
    "Deadlock Mod Manager",
    "modding",
    "documentation",
    "guide",
    "tutorial",
  ],
  authors: [{ name: "Deadlock Mods Team" }],
  creator: "Deadlock Mods",
  publisher: "Deadlock Mods",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://docs.deadlockmods.app",
    siteName: "Deadlock Mod Manager Docs",
    title: {
      template: "%s - Deadlock Mod Manager Docs",
      default: "Deadlock Mod Manager Documentation",
    },
    description:
      "Complete documentation for Deadlock Mod Manager - installation, usage, troubleshooting, and development guides.",
  },
  twitter: {
    card: "summary_large_image",
    title: {
      template: "%s - Deadlock Mod Manager Docs",
      default: "Deadlock Mod Manager Documentation",
    },
    description:
      "Complete documentation for Deadlock Mod Manager - installation, usage, troubleshooting, and development guides.",
    creator: "@deadlockmods",
  },
  alternates: {
    canonical: "https://docs.deadlockmods.app",
  },
};

export default function Layout({ children }: LayoutProps) {
  return (
    <html lang='en' className={inter.className} suppressHydrationWarning>
      <body className='flex flex-col min-h-screen'>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
