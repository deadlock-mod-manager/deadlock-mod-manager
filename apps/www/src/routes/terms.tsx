import { ArrowUpIcon } from "@deadlock-mods/ui/icons";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/terms")({
  component: TermsComponent,
  head: () => ({
    meta: [
      {
        title: "Terms of Service | Deadlock Mod Manager",
      },
      {
        name: "description",
        content:
          "Terms of Service for Deadlock Mod Manager - Understand your rights and responsibilities when using our software.",
      },
    ],
  }),
});

function TermsComponent() {
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className='min-h-screen bg-background'>
      <div className='container mx-auto max-w-6xl py-12'>
        {/* Header */}
        <div className='mb-12 text-center'>
          <h1 className='mb-4 font-bold font-primary text-5xl tracking-tight'>
            Terms of Service
          </h1>
          <p className='text-muted-foreground text-xl'>
            Understand your rights and responsibilities when using our software
          </p>
          <div className='mx-auto mt-6 h-1 w-24 bg-primary'></div>
          <p className='text-muted-foreground text-sm mt-4'>
            Last updated: September 24, 2025
          </p>
        </div>

        <div className='grid gap-8 lg:grid-cols-4'>
          {/* Table of Contents */}
          <aside className='lg:col-span-1'>
            <div className='sticky top-8 rounded-lg border bg-card p-6'>
              <h2 className='mb-4 font-semibold text-lg'>Table of Contents</h2>
              <nav className='space-y-2'>
                {[
                  { id: "acceptance-terms", title: "1. Acceptance of Terms" },
                  {
                    id: "description-service",
                    title: "2. Description of Service",
                  },
                  {
                    id: "user-responsibilities",
                    title: "3. User Responsibilities",
                  },
                  {
                    id: "intellectual-property",
                    title: "4. Intellectual Property",
                  },
                  { id: "data-collection", title: "5. Data Collection" },
                  {
                    id: "disclaimer-warranties",
                    title: "6. Disclaimer of Warranties",
                  },
                  {
                    id: "limitation-liability",
                    title: "7. Limitation of Liability",
                  },
                  { id: "changes-terms", title: "8. Changes to Terms" },
                  { id: "contact", title: "9. Contact" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => scrollToSection(item.id)}
                    className='block w-full text-left text-muted-foreground text-sm transition-colors hover:text-primary'>
                    {item.title}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main Content */}
          <main className='lg:col-span-3'>
            <div className='space-y-8'>
              <section className='scroll-mt-8'>
                <h2
                  id='acceptance-terms'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  1. Acceptance of Terms
                </h2>
                <p className='text-muted-foreground leading-relaxed'>
                  By downloading and using Deadlock Mod Manager, you agree to
                  these Terms of Service. If you do not agree to these terms, do
                  not use the software.
                </p>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='description-service'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  2. Description of Service
                </h2>
                <p className='text-muted-foreground leading-relaxed mb-4'>
                  Deadlock Mod Manager is a third-party tool that facilitates
                  the installation and management of game modifications for
                  Deadlock. The software is not affiliated with, endorsed by, or
                  connected to Valve Corporation.
                </p>
                <div className='rounded-lg border-l-4 border-amber-500 bg-amber-500/10 p-4'>
                  <p className='font-medium text-amber-500 mb-2'>
                    Important Notice
                  </p>
                  <p className='text-sm text-muted-foreground'>
                    This application is an independent project and is not
                    officially endorsed by Valve Corporation or the Deadlock
                    development team.
                  </p>
                </div>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='user-responsibilities'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  3. User Responsibilities
                </h2>
                <ul className='space-y-2 text-muted-foreground ml-6'>
                  <li className='list-disc'>
                    You are responsible for any mods you choose to download and
                    install
                  </li>
                  <li className='list-disc'>
                    You agree not to use the software for any illegal purposes
                  </li>
                  <li className='list-disc'>
                    You understand that using mods may affect your game
                    experience and potentially violate game terms of service
                  </li>
                  <li className='list-disc'>
                    You agree to respect the intellectual property rights of mod
                    creators and game developers
                  </li>
                  <li className='list-disc'>
                    You will not use the software to distribute malicious
                    content or circumvent game security measures
                  </li>
                </ul>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='intellectual-property'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  4. Intellectual Property
                </h2>
                <p className='text-muted-foreground leading-relaxed mb-4'>
                  Deadlock Mod Manager is open-source software released under an
                  open-source license. The mods available through the manager
                  are created by third-party developers and are subject to their
                  own licenses and terms.
                </p>
                <p className='text-muted-foreground leading-relaxed'>
                  Users are responsible for ensuring they have the right to
                  download and use any mods they install through the
                  application.
                </p>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='data-collection'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  5. Data Collection
                </h2>
                <p className='text-muted-foreground leading-relaxed mb-4'>
                  Our data collection practices are detailed in our Privacy
                  Policy. In summary:
                </p>
                <ul className='space-y-2 text-muted-foreground ml-6 mb-4'>
                  <li className='list-disc'>
                    <strong className='text-foreground'>
                      Optional Analytics:
                    </strong>{" "}
                    With your consent, we collect anonymous usage analytics to
                    improve the application
                  </li>
                  <li className='list-disc'>
                    <strong className='text-foreground'>Crash Reports:</strong>{" "}
                    Automatic error reporting to help fix bugs and improve
                    stability
                  </li>
                  <li className='list-disc'>
                    <strong className='text-foreground'>
                      No Personal Data:
                    </strong>{" "}
                    We do not collect personal information or identifiable data
                  </li>
                </ul>
                <p className='text-muted-foreground leading-relaxed'>
                  For detailed information, please refer to our{" "}
                  <a href='/privacy' className='text-primary hover:underline'>
                    Privacy Policy
                  </a>
                  .
                </p>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='disclaimer-warranties'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  6. Disclaimer of Warranties
                </h2>
                <p className='text-muted-foreground leading-relaxed mb-4'>
                  The software is provided "as is" without warranty of any kind.
                  We do not guarantee that the software will meet your
                  requirements or that it will be uninterrupted, secure, or
                  error-free.
                </p>
                <p className='text-muted-foreground leading-relaxed'>
                  We make no warranties regarding the compatibility, safety, or
                  legality of any mods available through the application.
                </p>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='limitation-liability'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  7. Limitation of Liability
                </h2>
                <p className='text-muted-foreground leading-relaxed mb-4'>
                  We shall not be liable for any indirect, incidental, special,
                  consequential, or punitive damages resulting from your use or
                  inability to use the software.
                </p>
                <p className='text-muted-foreground leading-relaxed'>
                  This includes but is not limited to damages caused by game
                  account suspensions, data loss, or conflicts between mods and
                  game updates.
                </p>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='changes-terms'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  8. Changes to Terms
                </h2>
                <p className='text-muted-foreground leading-relaxed mb-4'>
                  We reserve the right to modify these terms at any time.
                  Continued use of the software after changes constitutes
                  acceptance of the new terms.
                </p>
                <p className='text-muted-foreground leading-relaxed'>
                  We will make reasonable efforts to notify users of significant
                  changes through the application or our website.
                </p>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='contact'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  9. Contact
                </h2>
                <p className='text-muted-foreground leading-relaxed'>
                  For questions about these Terms of Service, please create an
                  issue on our{" "}
                  <a
                    href='https://github.com/Stormix/deadlock-modmanager'
                    rel='noopener noreferrer'
                    target='_blank'
                    className='text-primary hover:underline'>
                    GitHub repository
                  </a>
                  .
                </p>
              </section>
            </div>
          </main>
        </div>

        {/* Back to Top Button */}
        {showBackToTop && (
          <button
            onClick={scrollToTop}
            className='fixed right-8 bottom-8 z-50 rounded-full bg-primary p-3 text-primary-foreground shadow-lg transition-all hover:scale-110 hover:bg-primary/90'
            aria-label='Back to top'>
            <ArrowUpIcon className='h-5 w-5' />
          </button>
        )}
      </div>
    </div>
  );
}
