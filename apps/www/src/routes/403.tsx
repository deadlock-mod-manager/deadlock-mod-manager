import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowLeft, Home, Lock } from "@deadlock-mods/ui/icons";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/403")({
  component: ForbiddenComponent,
});

function ForbiddenComponent() {
  const [glitchText, setGlitchText] = useState("403");
  const [isGlitching, setIsGlitching] = useState(false);

  useEffect(() => {
    const glitchInterval = setInterval(() => {
      setIsGlitching(true);
      const glitchVariations = [
        "403",
        "∞0∞",
        "4∅3",
        "?0?",
        "403",
        "∅∞∅",
        "4?3",
        "403",
      ];
      let currentIndex = 0;

      const textInterval = setInterval(() => {
        if (currentIndex < glitchVariations.length) {
          setGlitchText(glitchVariations[currentIndex]);
          currentIndex++;
        } else {
          setGlitchText("403");
          setIsGlitching(false);
          clearInterval(textInterval);
        }
      }, 120);

      setTimeout(() => {
        clearInterval(textInterval);
        setGlitchText("403");
        setIsGlitching(false);
      }, 1000);
    }, 5000);

    return () => clearInterval(glitchInterval);
  }, []);

  const particles = Array.from({ length: 20 }, (_, i) => {
    const particleId = `particle-${i}-${Math.random().toString(36).substr(2, 9)}`;
    return (
      <div
        key={particleId}
        className={`absolute w-1 h-1 bg-primary/30 rounded-full animate-ping`}
        style={{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 3}s`,
          animationDuration: `${2 + Math.random() * 2}s`,
        }}
      />
    );
  });

  return (
    <div className='min-h-screen bg-background relative overflow-hidden flex items-center justify-center'>
      <div className='absolute inset-0 pointer-events-none'>{particles}</div>

      <div
        className='absolute inset-0 opacity-[0.03]'
        style={{
          backgroundImage: `
            linear-gradient(rgba(239, 225, 190, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(239, 225, 190, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px",
        }}
      />

      <div className='container mx-auto px-4 text-center relative z-10'>
        <div className='max-w-2xl mx-auto space-y-8'>
          <div className='relative'>
            <div
              className={`font-primary font-bold text-8xl md:text-9xl lg:text-[12rem] leading-none transition-all duration-300 ${
                isGlitching
                  ? "bg-gradient-to-r from-red-500 via-primary to-red-500 bg-clip-text text-transparent filter blur-[1px]"
                  : "bg-gradient-to-r from-[#EFE1BE] to-primary bg-clip-text text-transparent"
              }`}>
              {glitchText}
            </div>

            {isGlitching && (
              <>
                <div className='absolute inset-0 font-primary font-bold text-8xl md:text-9xl lg:text-[12rem] leading-none text-red-500/20 animate-pulse transform translate-x-1'>
                  {glitchText}
                </div>
                <div className='absolute inset-0 font-primary font-bold text-8xl md:text-9xl lg:text-[12rem] leading-none text-blue-500/20 animate-pulse transform -translate-x-1'>
                  {glitchText}
                </div>
              </>
            )}
          </div>

          <div className='space-y-4'>
            <h1 className='font-primary font-bold text-2xl md:text-3xl'>
              <span className='bg-gradient-to-r from-[#EFE1BE] to-primary bg-clip-text text-transparent'>
                Access Denied
              </span>
            </h1>
            <p className='text-muted-foreground text-lg max-w-md mx-auto'>
              This realm is protected by powerful wards. Even the Patrons cannot
              grant you passage without the proper authorization!
            </p>
          </div>

          <div className='relative py-8'>
            <div className='inline-flex items-center justify-center w-32 h-32 rounded-full border-2 border-primary/20 bg-primary/5 backdrop-blur-sm'>
              <div className='relative'>
                <Lock size={48} className='text-primary animate-pulse' />
                <div className='absolute -inset-4 border-2 border-primary/30 rounded-full animate-ping opacity-75' />
                <div
                  className='absolute -inset-8 border border-primary/20 rounded-full animate-ping opacity-50'
                  style={{ animationDelay: "0.5s" }}
                />
              </div>
            </div>
          </div>

          <div className='flex flex-col sm:flex-row gap-4 justify-center items-center'>
            <Button asChild size='lg' className='min-w-40'>
              <Link to='/'>
                <Home className='mr-2' size={20} />
                Return Home
              </Link>
            </Button>

            <Button variant='ghost' size='lg' asChild className='min-w-40'>
              <button onClick={() => window.history.back()}>
                <ArrowLeft className='mr-2' size={20} />
                Escape the Void
              </button>
            </Button>
          </div>

          <div className='pt-8 border-t border-border/50 space-y-3'>
            <p className='text-sm text-muted-foreground'>
              Need access to this area?
            </p>
            <p className='text-xs text-muted-foreground/80'>
              Contact an administrator or check{" "}
              <a
                href='https://github.com/stormix/deadlock-modmanager/issues'
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary hover:text-primary/80 transition-colors underline underline-offset-4'>
                The New York Oracle
              </a>{" "}
              for assistance. Return to{" "}
              <Link
                to='/'
                className='text-primary hover:text-primary/80 transition-colors underline underline-offset-4'>
                the Cursed Apple
              </Link>{" "}
              to continue your modding ritual.
            </p>
          </div>
        </div>
      </div>

      <div
        className='absolute top-20 left-10 w-8 h-8 border-2 border-amber-400/20 rotate-45 animate-spin-slow opacity-60'
        title='Amber Hand Symbol'
      />
      <div
        className='absolute top-40 right-20 w-6 h-6 bg-blue-400/10 rounded-full animate-bounce opacity-40'
        style={{ animationDelay: "1s" }}
        title='Sapphire Flame'
      />
      <div
        className='absolute bottom-32 left-1/4 w-4 h-4 border border-primary/30 animate-pulse opacity-50'
        style={{ animationDelay: "2s" }}
        title='Astral Gate Fragment'
      />
      <div
        className='absolute bottom-20 right-1/3 w-10 h-10 border-2 border-primary/15 rounded-full animate-spin opacity-30'
        style={{ animationDelay: "0.5s" }}
        title='Maelstrom Echo'
      />

      <div
        className='absolute top-1/3 left-5 text-primary/20 text-xs animate-pulse opacity-40'
        style={{ animationDelay: "3s" }}>
        ✦
      </div>
      <div
        className='absolute top-2/3 right-10 text-amber-400/20 text-lg animate-ping opacity-30'
        style={{ animationDelay: "1.5s" }}>
        ◈
      </div>
    </div>
  );
}
