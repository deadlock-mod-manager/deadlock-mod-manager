import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import React from "react";
import {
  LuDownload,
  LuGlobe,
  LuLayoutGrid,
  LuRefreshCw,
  LuSettings,
} from "react-icons/lu";
import { RiOpenSourceFill } from "react-icons/ri";

type FeaturesProps = {
  icon: React.ElementType;
  title: string;
  description: string;
};

const featureList: FeaturesProps[] = [
  {
    icon: LuDownload,
    title: "One-click install",
    description:
      "Grab a mod and we’ll put it where Deadlock expects it. No manual steps, no guesswork.",
  },
  {
    icon: LuSettings,
    title: "Manage with confidence",
    description:
      "See everything in My Mods. Toggle on/off, update, or remove whenever you like.",
  },
  {
    icon: LuLayoutGrid,
    title: "Built-in browser",
    description:
      "Search and discover community mods without leaving the app. It’s all in one place.",
  },
  {
    icon: LuGlobe,
    title: "Cross-platform",
    description:
      "Works on Windows, macOS, and Linux. Small download, quick start, low overhead.",
  },
  {
    icon: RiOpenSourceFill,
    title: "Open source",
    description:
      "Trust what you use. Read the code, file issues, or contribute features. Your call.",
  },
  {
    icon: LuRefreshCw,
    title: "Easy updates",
    description:
      "Out-of-date mods are clearly marked. Update them in one click.",
  },
];

export const FeaturesSection = () => {
  return (
    <section className='container mx-auto py-24 sm:py-32' id='features'>
      <h2 className='mb-2 text-center text-lg text-primary tracking-wider'>
        Features
      </h2>

      <h2 className='mb-8 text-center font-bold font-primary text-3xl md:text-4xl'>
        Make Deadlock yours
      </h2>

      <div className='grid gap-6 sm:grid-cols-2 lg:grid-cols-3'>
        {featureList.map(({ icon, title, description }) => (
          <Card
            className='h-full border-muted/50 bg-background/50 backdrop-blur-sm'
            key={title}>
            <CardHeader className='flex items-center justify-center'>
              <div className='mb-4 rounded-full bg-primary/20 p-3 ring-8 ring-primary/10'>
                {React.createElement(icon, {
                  size: 48,
                  className: "text-primary",
                })}
              </div>

              <CardTitle>{title}</CardTitle>
            </CardHeader>

            <CardContent className='text-center text-muted-foreground'>
              {description}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};
