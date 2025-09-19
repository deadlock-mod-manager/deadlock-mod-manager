import { createFileRoute } from "@tanstack/react-router";

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
  return (
    <div className='container mx-auto max-w-3xl py-12'>
      <h1 className='mb-8 font-bold text-4xl'>Terms of Service</h1>

      <div className='prose prose-invert max-w-none'>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By downloading and using Deadlock Mod Manager, you agree to these
          Terms of Service. If you do not agree to these terms, do not use the
          software.
        </p>

        <h2>2. Description of Service</h2>
        <p>
          Deadlock Mod Manager is a third-party tool that facilitates the
          installation and management of game modifications for Deadlock. The
          software is not affiliated with, endorsed by, or connected to Valve
          Corporation.
        </p>

        <h2>3. User Responsibilities</h2>
        <ul>
          <li>
            You are responsible for any mods you choose to download and install
          </li>
          <li>You agree not to use the software for any illegal purposes</li>
          <li>
            You understand that using mods may affect your game experience
          </li>
        </ul>

        <h2>4. Intellectual Property</h2>
        <p>
          Deadlock Mod Manager is open-source software. The mods available
          through the manager are created by third-party developers and are
          subject to their own licenses and terms.
        </p>

        <h2>5. Data Collection</h2>
        <p>
          By using the software, you agree to the collection of anonymous crash
          reports and error data through Sentry.io. This data helps us improve
          the stability and performance of the application. For more information
          about data collection, please refer to our Privacy Policy.
        </p>

        <h2>6. Disclaimer of Warranties</h2>
        <p>
          The software is provided "as is" without warranty of any kind. We do
          not guarantee that the software will meet your requirements or that it
          will be uninterrupted, secure, or error-free.
        </p>

        <h2>7. Limitation of Liability</h2>
        <p>
          We shall not be liable for any indirect, incidental, special,
          consequential, or punitive damages resulting from your use or
          inability to use the software.
        </p>

        <h2>8. Changes to Terms</h2>
        <p>
          We reserve the right to modify these terms at any time. Continued use
          of the software after changes constitutes acceptance of the new terms.
        </p>

        <h2>9. Contact</h2>
        <p>
          For questions about these Terms of Service, please create an issue on
          our{" "}
          <a
            className='text-primary hover:underline'
            href='https://github.com/Stormix/deadlock-modmanager'
            rel='noopener noreferrer'
            target='_blank'>
            GitHub repository
          </a>
          .
        </p>
      </div>
    </div>
  );
}
