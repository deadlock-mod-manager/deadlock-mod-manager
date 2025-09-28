import "@/app/global.css";
import { RootProvider } from "fumadocs-ui/provider";
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
  openGraph: {
    type: "website",
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
