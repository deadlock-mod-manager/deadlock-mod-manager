import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

type FAQProps = {
  question: string;
  answer: string | React.ReactNode;
  value: string;
};

const FAQList: FAQProps[] = [
  {
    question: 'What is Deadlock Mod Manager?',
    answer:
      'Deadlock Mod Manager is a cross-platform desktop application that helps you download, install, and manage mods for the Valve game Deadlock. It provides an easy-to-use interface for browsing and installing community-created content.',
    value: 'item-1',
  },
  {
    question: 'How do I install mods?',
    answer: (
      <ol className="list-inside list-decimal space-y-2">
        <li>Download and install Deadlock Mod Manager</li>
        <li>Launch the application</li>
        <li>Browse available mods in the 'Get Mods' section</li>
        <li>Click the download button on any mod you want to install</li>
        <li>
          The mod will be automatically installed and ready to use in-game
        </li>
      </ol>
    ),
    value: 'item-2',
  },
  {
    question: 'Is it safe to use mods?',
    answer:
      "The mod manager only copies .vpk files (Valve Pak files) provided by third-party authors into your game directory. Unless there's a yet-unknown way to exploit these types of files, the process is generally safe. If there's anything malicious in the mod files, Windows Defender and other antivirus software should detect it. As with any third-party content, use mods at your own risk.",
    value: 'item-3',
  },
  {
    question: 'How do I uninstall mods?',
    answer:
      "You can uninstall mods through the 'My Mods' section of the application. You can also use the 'Clear All Mods' option in Settings to remove all installed mods at once.",
    value: 'item-4',
  },
  {
    question: 'Which platforms are supported?',
    answer:
      'Currently, Deadlock Mod Manager is only available for Windows. Linux support is planned for future releases. The application is built with Tauri and React, which makes cross-platform support technically possible.',
    value: 'item-5',
  },
  {
    question: 'I found a bug, how do I report it?',
    answer: (
      <span>
        You can report bugs by creating an issue on our{' '}
        <a
          className="text-primary hover:underline"
          href="https://github.com/Stormix/deadlock-modmanager/issues/new?labels=bug&template=bug-report---.md"
          rel="noopener"
          target="_blank"
        >
          GitHub repository
        </a>
        . Please include as much detail as possible about the bug and steps to
        reproduce it.
      </span>
    ),
    value: 'item-6',
  },
  {
    question: 'Will Deadlock have official skins?',
    answer: (
      <span>
        Deadlock is currently in closed beta and doesn't include skins or
        cosmetics yet. However, given Valve's track record with games like CS2
        and DOTA 2, we expect skins to be added in the future. When they do,
        Deadlock Mod Manager will still be there for other 3rd party skins.
      </span>
    ),
    value: 'item-7',
  },
  {
    question: 'Can other players see my installed skins?',
    answer:
      'No, skins installed through Deadlock Mod Manager are client-side only, meaning only you can see them. Other players in your game will see the default models and textures.',
    value: 'item-8',
  },
];

export const FAQSection: React.FC = () => {
  return (
    <section className="container mx-auto py-24 sm:py-32 md:w-[700px]" id="faq">
      <div className="mb-8 text-center">
        <h2 className="mb-2 text-center text-lg text-primary tracking-wider">
          FAQ
        </h2>

        <h2 className="text-center font-bold text-3xl md:text-4xl">
          Frequently Asked Questions
        </h2>
      </div>

      <Accordion className="AccordionRoot" collapsible type="single">
        {FAQList.map(({ question, answer, value }) => (
          <AccordionItem key={value} value={value}>
            <AccordionTrigger className="text-left">
              {question}
            </AccordionTrigger>
            <AccordionContent>{answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
};
