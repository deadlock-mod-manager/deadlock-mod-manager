import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpIcon } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/privacy")({
  component: PrivacyComponent,
  head: () => ({
    meta: [
      {
        title: "Privacy Policy | Deadlock Mod Manager",
      },
      {
        name: "description",
        content:
          "Privacy Policy for Deadlock Mod Manager - Learn how we handle your data and protect your privacy.",
      },
    ],
  }),
});

function PrivacyComponent() {
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
            Privacy Policy
          </h1>
          <p className='text-muted-foreground text-xl'>
            Learn how we handle your data and protect your privacy
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
                  {
                    id: "information-collection",
                    title: "1. Information Collection",
                  },
                  {
                    id: "data-storage",
                    title: "2. Data Storage & API Communication",
                  },
                  {
                    id: "third-party-content",
                    title: "3. Third-Party Content",
                  },
                  { id: "system-access", title: "4. System Access" },
                  {
                    id: "analytics-crash-reports",
                    title: "5. Analytics & Crash Reports",
                  },
                  { id: "updates", title: "6. Updates" },
                  { id: "changes-policy", title: "7. Changes to Policy" },
                  { id: "contact", title: "8. Contact" },
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
                  id='information-collection'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  1. Information Collection
                </h2>
                <p className='text-muted-foreground leading-relaxed mb-4'>
                  Deadlock Mod Manager is a desktop application that runs
                  locally on your computer. While we do not collect personal
                  information that identifies you, we may collect certain
                  technical and usage data to provide and improve our service.
                </p>

                <h3 className='text-xl font-semibold mb-4'>Usage Data</h3>
                <p className='text-muted-foreground leading-relaxed mb-4'>
                  We collect different types of usage data depending on your
                  consent preferences:
                </p>

                <div className='mb-6'>
                  <h4 className='text-lg font-medium mb-3 text-foreground'>
                    Data Collected Regardless of Consent
                  </h4>
                  <p className='text-muted-foreground text-sm mb-3'>
                    The following technical data is necessary for basic service
                    operation:
                  </p>
                  <ul className='space-y-2 text-muted-foreground ml-6 mb-4'>
                    <li className='list-disc'>
                      IP address (anonymized via Cloudflare)
                    </li>
                    <li className='list-disc'>
                      API request patterns and response times
                    </li>
                    <li className='list-disc'>
                      Basic error logs for service stability
                    </li>
                    <li className='list-disc'>
                      Geographic region (country-level only)
                    </li>
                  </ul>
                </div>

                <div className='mb-6'>
                  <h4 className='text-lg font-medium mb-3 text-foreground'>
                    Analytics Data (Enabled by Default, Can Be Disabled)
                  </h4>
                  <div className='rounded-lg border-l-4 border-orange-500 bg-orange-500/10 p-4 mb-4'>
                    <p className='text-sm text-muted-foreground'>
                      The following analytics data is collected by default to
                      help improve the application. You can disable this at any
                      time in the Privacy Settings.
                    </p>
                  </div>
                  <ul className='space-y-2 text-muted-foreground ml-6'>
                    <li className='list-disc'>
                      Browser type and version (for web interface)
                    </li>
                    <li className='list-disc'>
                      Pages visited within the application
                    </li>
                    <li className='list-disc'>Time and date of visits</li>
                    <li className='list-disc'>
                      Device identifiers (anonymous hardware ID)
                    </li>
                    <li className='list-disc'>
                      Operating system and app version
                    </li>
                    <li className='list-disc'>
                      User interaction patterns and feature usage
                    </li>
                    <li className='list-disc'>
                      Session duration and navigation flows
                    </li>
                    <li className='list-disc'>
                      Mod management activities (downloads, installations)
                    </li>
                  </ul>
                </div>

                <h3 className='text-xl font-semibold mb-4'>
                  How We Use Collected Data
                </h3>
                <p className='text-muted-foreground leading-relaxed mb-4'>
                  We use collected data for purposes including:
                </p>
                <ul className='space-y-2 text-muted-foreground ml-6'>
                  <li className='list-disc'>
                    <strong className='text-foreground'>
                      Providing and maintaining the Service:
                    </strong>{" "}
                    Ensuring the application functions correctly and remains
                    accessible
                  </li>
                  <li className='list-disc'>
                    <strong className='text-foreground'>
                      Notifying you about Service changes:
                    </strong>{" "}
                    Communicating important updates, new features, or
                    maintenance schedules
                  </li>
                  <li className='list-disc'>
                    <strong className='text-foreground'>
                      Allowing participation in interactive features:
                    </strong>{" "}
                    Enabling mod sharing, profile management, and community
                    features
                  </li>
                  <li className='list-disc'>
                    <strong className='text-foreground'>
                      Providing customer support:
                    </strong>{" "}
                    Troubleshooting issues and assisting with technical problems
                  </li>
                  <li className='list-disc'>
                    <strong className='text-foreground'>
                      Analyzing and improving our Service:
                    </strong>{" "}
                    Understanding usage patterns to enhance performance and user
                    experience
                  </li>
                  <li className='list-disc'>
                    <strong className='text-foreground'>
                      Moderating mod submissions:
                    </strong>{" "}
                    Ensuring quality and safety of community-contributed content
                  </li>
                </ul>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='data-storage'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  2. Data Storage and API Communication
                </h2>
                <p className='text-muted-foreground leading-relaxed mb-4'>
                  The majority of your data, including mod files and settings,
                  is stored locally on your computer. However, the application
                  does communicate with our API servers for certain
                  functionality:
                </p>
                <ul className='space-y-2 text-muted-foreground ml-6 mb-4'>
                  <li className='list-disc'>
                    <strong className='text-foreground'>Mod Discovery:</strong>{" "}
                    When browsing and searching for mods, requests are made to
                    our API to fetch mod information and metadata
                  </li>
                  <li className='list-disc'>
                    <strong className='text-foreground'>Mod Downloads:</strong>{" "}
                    Download requests are processed through our API to provide
                    mod files from third-party sources
                  </li>
                  <li className='list-disc'>
                    <strong className='text-foreground'>
                      Profile Sharing:
                    </strong>{" "}
                    When you share mod profiles, the profile data is temporarily
                    stored on our servers with a unique identifier
                  </li>
                </ul>
                <div className='rounded-lg border-l-4 border-blue-500 bg-blue-500/10 p-4 mb-4'>
                  <p className='font-medium text-blue-500 mb-2'>
                    Traffic Analytics
                  </p>
                  <p className='text-sm text-muted-foreground'>
                    We use Cloudflare Analytics to monitor API traffic,
                    performance, and security. This includes anonymous request
                    metrics, geographic regions, and basic traffic patterns. No
                    personal data is collected through these analytics.
                  </p>
                </div>
                <p className='text-muted-foreground leading-relaxed'>
                  All API communications use secure HTTPS connections. We do not
                  store personal information on our servers - only anonymous
                  usage patterns and publicly available mod data.
                </p>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='third-party-content'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  3. Third-Party Content
                </h2>
                <p className='text-muted-foreground leading-relaxed'>
                  When you download mods through the application, you are
                  accessing content from third-party sources. We recommend
                  reviewing the privacy policies of these sources.
                </p>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='system-access'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  4. System Access
                </h2>
                <p className='text-muted-foreground leading-relaxed mb-4'>
                  The application requires access to:
                </p>
                <ul className='space-y-2 text-muted-foreground ml-6'>
                  <li className='list-disc'>
                    Your game installation directory to install mods
                  </li>
                  <li className='list-disc'>
                    Internet access to download mod files
                  </li>
                  <li className='list-disc'>
                    Local storage to save settings and cached files
                  </li>
                </ul>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='analytics-crash-reports'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-6'>
                  5. Analytics and Crash Reports
                </h2>

                <div className='space-y-6'>
                  <div>
                    <h3 className='text-xl font-semibold mb-4'>
                      Usage Analytics (Enabled by Default)
                    </h3>

                    <div className='rounded-lg border-l-4 border-primary bg-primary/10 p-4 mb-4'>
                      <p className='font-medium text-primary mb-2'>
                        Privacy Control
                      </p>
                      <p className='text-sm text-muted-foreground'>
                        Analytics are enabled by default but can be disabled at
                        any time in Privacy Settings. All data is anonymous with
                        no personal information collected.
                      </p>
                    </div>

                    <p className='text-muted-foreground leading-relaxed mb-4'>
                      We collect anonymous usage analytics through Google
                      Analytics 4 to improve the application experience. This
                      feature is enabled by default, but you can disable it at
                      any time in the app's Privacy Settings. When enabled, we
                      collect:
                    </p>

                    <ul className='space-y-2 text-muted-foreground ml-6 mb-4'>
                      <li className='list-disc'>
                        App usage patterns (pages visited, features used)
                      </li>
                      <li className='list-disc'>
                        Mod management activities (downloads, installations,
                        uninstalls)
                      </li>
                      <li className='list-disc'>
                        Error occurrences and performance metrics
                      </li>
                      <li className='list-disc'>
                        Session duration and navigation flows
                      </li>
                      <li className='list-disc'>
                        General settings preferences
                      </li>
                    </ul>

                    <p className='text-muted-foreground leading-relaxed'>
                      <strong className='text-foreground'>
                        Complete Anonymity:
                      </strong>{" "}
                      Users are identified only by an anonymous hardware ID - no
                      personal information, usernames, or identifying data is
                      collected. All analytics data is processed in accordance
                      with{" "}
                      <a
                        href='https://policies.google.com/privacy'
                        rel='noopener noreferrer'
                        target='_blank'
                        className='text-primary hover:underline'>
                        Google's Privacy Policy
                      </a>
                      .
                    </p>
                  </div>

                  <div>
                    <h3 className='text-xl font-semibold mb-4'>
                      Crash Reports
                    </h3>
                    <p className='text-muted-foreground leading-relaxed mb-4'>
                      We use Sentry.io to collect crash reports and error data
                      to improve the application's stability. This data
                      includes:
                    </p>
                    <ul className='space-y-2 text-muted-foreground ml-6 mb-4'>
                      <li className='list-disc'>
                        Error details and stack traces
                      </li>
                      <li className='list-disc'>
                        Basic device information (OS, app version)
                      </li>
                      <li className='list-disc'>Anonymous session data</li>
                    </ul>
                    <p className='text-muted-foreground leading-relaxed'>
                      No personally identifiable information is intentionally
                      collected. All data is processed in accordance with{" "}
                      <a
                        href='https://sentry.io/privacy/'
                        rel='noopener noreferrer'
                        target='_blank'
                        className='text-primary hover:underline'>
                        Sentry's Privacy Policy
                      </a>
                      .
                    </p>
                  </div>
                </div>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='updates'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  6. Updates
                </h2>
                <p className='text-muted-foreground leading-relaxed'>
                  The application may check for updates when connected to the
                  internet. This process only downloads version information and
                  does not transmit any personal data.
                </p>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='changes-policy'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  7. Changes to Privacy Policy
                </h2>
                <p className='text-muted-foreground leading-relaxed'>
                  We may update this privacy policy from time to time. Any
                  changes will be reflected in the application and on our
                  website.
                </p>
              </section>

              <section className='scroll-mt-8'>
                <h2
                  id='contact'
                  className='text-2xl font-semibold border-b border-border pb-2 mb-4'>
                  8. Contact
                </h2>
                <p className='text-muted-foreground leading-relaxed'>
                  For questions about this Privacy Policy, please create an
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
