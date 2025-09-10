import React from 'react';
import {
  LuDownload,
  LuGlobe,
  LuLayoutGrid,
  LuRefreshCw,
  LuSettings,
} from 'react-icons/lu';
import { RiOpenSourceFill } from 'react-icons/ri';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type FeaturesProps = {
  icon: React.ElementType;
  title: string;
  description: string;
};

const featureList: FeaturesProps[] = [
  {
    icon: LuDownload,
    title: 'Easy Installation',
    description:
      'Download and install mods with a single click. Our mod manager handles all the complexity, so you can focus on enjoying the game.',
  },
  {
    icon: LuSettings,
    title: 'Mod Management',
    description:
      'Keep track of your installed mods, update them when new versions are available, and easily remove them when needed.',
  },
  {
    icon: LuLayoutGrid,
    title: 'Browse Mods',
    description:
      "Discover and browse community-created mods and skins. Search, sort, and filter to find exactly what you're looking for.",
  },
  {
    icon: LuGlobe,
    title: 'Cross-Platform',
    description:
      'Available for Windows and Linux (coming soon). Built with modern technologies to ensure compatibility across different operating systems.',
  },
  {
    icon: RiOpenSourceFill,
    title: 'Open Source',
    description:
      'Fully open-source and community-driven. Contribute, suggest features, or inspect the code - transparency is our priority.',
  },
  {
    icon: LuRefreshCw,
    title: 'Auto Updates',
    description:
      'Stay up to date with automatic updates. Get the latest features and security patches without manual intervention.',
  },
];

export const FeaturesSection = () => {
  return (
    <section className="container mx-auto py-24 sm:py-32" id="features">
      <h2 className="mb-2 text-center text-lg text-primary tracking-wider">
        Features
      </h2>

      <h2 className="mb-8 text-center font-bold text-3xl md:text-4xl">
        Enhance Your Deadlock Experience
      </h2>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {featureList.map(({ icon, title, description }) => (
          <Card
            className="h-full border-muted/50 bg-background/50 backdrop-blur-sm"
            key={title}
          >
            <CardHeader className="flex items-center justify-center">
              <div className="mb-4 rounded-full bg-primary/20 p-3 ring-8 ring-primary/10">
                {React.createElement(icon, {
                  size: 48,
                  className: 'text-primary',
                })}
              </div>

              <CardTitle>{title}</CardTitle>
            </CardHeader>

            <CardContent className="text-center text-muted-foreground">
              {description}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};
