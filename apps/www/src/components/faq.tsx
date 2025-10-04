type FAQProps = {
  id: number;
  question: string;
  answer: string | React.ReactNode;
};

const faqs: FAQProps[] = [
  {
    id: 1,
    question: "What is Deadlock Mod Manager?",
    answer:
      "A small desktop app that makes Deadlock modding simple. Browse, install, and manage mods without touching your game folders.",
  },
  {
    id: 2,
    question: "How do I install mods?",
    answer: (
      <ol className='list-inside list-decimal space-y-2'>
        <li>Download and open Deadlock Mod Manager.</li>
        <li>
          We'll auto-detect Deadlock (or you can set the folder in Settings).
        </li>
        <li>Browse mods and click Download.</li>
        <li>The app installs the mod in the right place. No manual steps.</li>
      </ol>
    ),
  },
  {
    id: 3,
    question: "Is it safe to use mods?",
    answer:
      "Mods are third-party files. The app copies .vpk files to your game directory and doesn't patch your executable. Use good judgment and scan files if you're unsure.",
  },
  {
    id: 4,
    question: "How do I uninstall mods?",
    answer:
      "Open My Mods and remove what you don't want, or use Clear All Mods in Settings.",
  },
  {
    id: 5,
    question: "Which platforms are supported?",
    answer:
      "Windows, macOS, and Linux. Arch users can also install from the AUR.",
  },
  {
    id: 6,
    question: "I found a bug, how do I report it?",
    answer: (
      <span>
        You can report bugs by creating an issue on our{" "}
        <a
          className='font-semibold text-primary hover:text-primary/80'
          href='https://github.com/Stormix/deadlock-modmanager/issues/new?labels=bug&template=bug-report---.md'
          rel='noopener'
          target='_blank'>
          GitHub repository
        </a>
        . Include steps to reproduce, what you expected, and what happened.
      </span>
    ),
  },
  {
    id: 7,
    question: "Where can I find more detailed documentation?",
    answer: (
      <span>
        Check out our comprehensive{" "}
        <a
          className='font-semibold text-primary hover:text-primary/80'
          href='https://docs.deadlockmods.app/'
          rel='noopener'
          target='_blank'>
          documentation site
        </a>{" "}
        for detailed guides, tutorials, and technical reference materials.
      </span>
    ),
  },
  {
    id: 8,
    question: "Will Deadlock have official skins?",
    answer:
      "Deadlock is evolving. If official cosmetics arrive, this app will still be here for community-made options.",
  },
  {
    id: 9,
    question: "Can other players see my installed skins?",
    answer:
      "No. These are client-side. Other players see default models and textures.",
  },
];

export const FAQSection: React.FC = () => {
  return (
    <section className='bg-background' id='faq'>
      <div className='mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20'>
        <div className='mx-auto max-w-2xl text-center'>
          <h2 className='mb-2 text-center text-lg text-primary tracking-wider'>
            FAQ
          </h2>
          <h2 className='mb-6 text-center font-bold font-primary text-3xl sm:mb-8 md:text-4xl'>
            Frequently asked questions
          </h2>
          <p className='mt-4 text-sm text-muted-foreground sm:mt-6 sm:text-base/7'>
            Have a different question and can't find the answer you're looking
            for? Check out our{" "}
            <a
              href='https://docs.deadlockmods.app/using-mod-manager/faq'
              className='font-semibold text-primary hover:text-primary/80'
              rel='noopener'
              target='_blank'>
              comprehensive FAQ documentation
            </a>{" "}
            or reach out by{" "}
            <a
              href='https://github.com/Stormix/deadlock-modmanager/issues/new'
              className='font-semibold text-primary hover:text-primary/80'
              rel='noopener'
              target='_blank'>
              creating an issue
            </a>
            .
          </p>
        </div>
        <div className='mt-12 sm:mt-16 lg:mt-20'>
          <dl className='space-y-12 sm:grid sm:grid-cols-2 sm:space-y-0 sm:gap-x-6 sm:gap-y-12 lg:gap-x-10 lg:gap-y-16'>
            {faqs.map((faq) => (
              <div key={faq.id}>
                <dt className='text-sm font-semibold text-foreground sm:text-base/7'>
                  {faq.question}
                </dt>
                <dd className='mt-2 text-sm text-muted-foreground sm:text-base/7'>
                  {faq.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
};
