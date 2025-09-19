import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type FAQProps = {
  question: string;
  answer: string | React.ReactNode;
  value: string;
};

const FAQList: FAQProps[] = [
  {
    question: "What is Deadlock Mod Manager?",
    answer:
      "A small desktop app that makes Deadlock modding simple. Browse, install, and manage mods without touching your game folders.",
    value: "item-1",
  },
  {
    question: "How do I install mods?",
    answer: (
      <ol className='list-inside list-decimal space-y-2'>
        <li>Download and open Deadlock Mod Manager.</li>
        <li>
          We’ll auto-detect Deadlock (or you can set the folder in Settings).
        </li>
        <li>Browse mods and click Download.</li>
        <li>The app installs the mod in the right place. No manual steps.</li>
      </ol>
    ),
    value: "item-2",
  },
  {
    question: "Is it safe to use mods?",
    answer:
      "Mods are third-party files. The app copies .vpk files to your game directory and doesn’t patch your executable. Use good judgment and scan files if you’re unsure.",
    value: "item-3",
  },
  {
    question: "How do I uninstall mods?",
    answer:
      "Open My Mods and remove what you don’t want, or use Clear All Mods in Settings.",
    value: "item-4",
  },
  {
    question: "Which platforms are supported?",
    answer:
      "Windows, macOS, and Linux. Arch users can also install from the AUR.",
    value: "item-5",
  },
  {
    question: "I found a bug, how do I report it?",
    answer: (
      <span>
        You can report bugs by creating an issue on our{" "}
        <a
          className='text-primary hover:underline'
          href='https://github.com/Stormix/deadlock-modmanager/issues/new?labels=bug&template=bug-report---.md'
          rel='noopener'
          target='_blank'>
          GitHub repository
        </a>
        . Include steps to reproduce, what you expected, and what happened.
      </span>
    ),
    value: "item-6",
  },
  {
    question: "Will Deadlock have official skins?",
    answer: (
      <span>
        Deadlock is evolving. If official cosmetics arrive, this app will still
        be here for community-made options.
      </span>
    ),
    value: "item-7",
  },
  {
    question: "Can other players see my installed skins?",
    answer:
      "No. These are client-side. Other players see default models and textures.",
    value: "item-8",
  },
];

export const FAQSection: React.FC = () => {
  return (
    <section className='container mx-auto py-24 sm:py-32 md:w-[700px]' id='faq'>
      <div className='mb-8 text-center'>
        <h2 className='mb-2 text-center text-lg text-primary tracking-wider'>
          FAQ
        </h2>

        <h2 className='text-center font-bold text-3xl md:text-4xl'>
          Frequently Asked Questions
        </h2>
      </div>

      <Accordion className='AccordionRoot' collapsible type='single'>
        {FAQList.map(({ question, answer, value }) => (
          <AccordionItem key={value} value={value}>
            <AccordionTrigger className='text-left'>
              {question}
            </AccordionTrigger>
            <AccordionContent>{answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
};
