import React from 'react';
import { LuDownload, LuPlay, LuSearch } from 'react-icons/lu';
import { Card, CardContent } from '@/components/ui/card';

const steps = [
  {
    icon: LuDownload,
    title: 'Download & Install',
    description:
      'Get the latest version of Deadlock Mod Manager for your platform',
  },
  {
    icon: LuSearch,
    title: 'Browse Mods',
    description: 'Explore our collection of community-created mods and skins',
  },
  {
    icon: LuPlay,
    title: 'Play & Enjoy',
    description: 'Launch Deadlock and enjoy your customized gaming experience',
  },
];

export const GettingStartedSection = () => {
  return (
    <section className="container mx-auto py-24 sm:py-32">
      <h2 className="mb-2 text-center text-lg text-primary tracking-wider">
        Getting Started
      </h2>

      <h2 className="mb-12 text-center font-bold text-3xl md:text-4xl">
        Up and Running in Minutes
      </h2>

      <div className="flex flex-col items-center justify-center gap-8 md:flex-row">
        {steps.map((step, index) => (
          <Card
            className="relative w-full border-muted/50 bg-background/50 backdrop-blur-sm md:w-1/3"
            key={step.title}
          >
            <CardContent className="pt-6">
              <div className="-top-6 -translate-x-1/2 absolute left-1/2">
                <div className="rounded-full bg-primary/20 p-3 ring-8 ring-background">
                  {React.createElement(step.icon, {
                    size: 24,
                    className: 'text-primary',
                  })}
                </div>
              </div>

              <div className="mt-4 text-center">
                <h3 className="mb-2 font-semibold text-xl">
                  {index + 1}. {step.title}
                </h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};
