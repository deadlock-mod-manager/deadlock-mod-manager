import { Card, CardContent } from "@/components/ui/card";
import React from "react";
import { LuDownload, LuPlay, LuSearch } from "react-icons/lu";

const steps = [
  {
    icon: LuDownload,
    title: "Download & Install",
    description: "Get the latest version of Deadlock Mod Manager for your platform"
  },
  {
    icon: LuSearch,
    title: "Browse Mods",
    description: "Explore our collection of community-created mods and skins"
  },
  {
    icon: LuPlay,
    title: "Play & Enjoy",
    description: "Launch Deadlock and enjoy your customized gaming experience"
  }
];

export const GettingStartedSection = () => {
  return (
    <section className="container py-24 sm:py-32 mx-auto">
      <h2 className="text-lg text-primary text-center mb-2 tracking-wider">
        Getting Started
      </h2>

      <h2 className="text-3xl md:text-4xl text-center font-bold mb-12">
        Up and Running in Minutes
      </h2>

      <div className="flex flex-col md:flex-row gap-8 justify-center items-center">
        {steps.map((step, index) => (
          <Card key={step.title} className="relative w-full md:w-1/3 bg-background/50 backdrop-blur-sm border-muted/50">
            <CardContent className="pt-6">
              <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                <div className="bg-primary/20 p-3 rounded-full ring-8 ring-background">
                  {React.createElement(step.icon, {
                    size: 24,
                    className: "text-primary",
                  })}
                </div>
              </div>
              
              <div className="mt-4 text-center">
                <h3 className="text-xl font-semibold mb-2">{index + 1}. {step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}; 