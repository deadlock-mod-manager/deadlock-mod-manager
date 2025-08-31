import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Deadlock Mod Manager',
  description: 'Privacy Policy for Deadlock Mod Manager',
};

const PrivacyPage = () => {
  return (
    <div className="container mx-auto max-w-3xl py-12">
      <h1 className="mb-8 font-bold text-4xl">Privacy Policy</h1>

      <div className="prose prose-invert prose-h2:mt-8 prose-headings:mb-4 max-w-none prose-h2:font-semibold prose-h2:text-2xl">
        <h2>1. Information Collection</h2>
        <p>
          Deadlock Mod Manager is a desktop application that runs locally on
          your computer. We do not collect, store, or transmit any personal
          information about our users.
        </p>

        <h2>2. Data Storage</h2>
        <p>
          All data, including mod files and settings, are stored locally on your
          computer. No information is sent to our servers.
        </p>

        <h2>3. Third-Party Content</h2>
        <p>
          When you download mods through the application, you are accessing
          content from third-party sources. We recommend reviewing the privacy
          policies of these sources.
        </p>

        <h2>4. System Access</h2>
        <p>The application requires access to:</p>
        <ul>
          <li>Your game installation directory to install mods</li>
          <li>Internet access to download mod files</li>
          <li>Local storage to save settings and cached files</li>
        </ul>

        <h2>5. Analytics and Crash Reports</h2>
        <p>
          We use Sentry.io to collect crash reports and error data to improve
          the application's stability. This data includes:
        </p>
        <ul>
          <li>Error details and stack traces</li>
          <li>Basic device information (OS, app version)</li>
          <li>Anonymous session data</li>
        </ul>
        <p>
          No personally identifiable information is intentionally collected. All
          data is processed in accordance with{' '}
          <a
            className="text-primary hover:underline"
            href="https://sentry.io/privacy/"
          >
            Sentry's Privacy Policy
          </a>
          .
        </p>

        <h2>6. Updates</h2>
        <p>
          The application may check for updates when connected to the internet.
          This process only downloads version information and does not transmit
          any personal data.
        </p>

        <h2>7. Changes to Privacy Policy</h2>
        <p>
          We may update this privacy policy from time to time. Any changes will
          be reflected in the application and on our website.
        </p>

        <h2>8. Contact</h2>
        <p>
          For questions about this Privacy Policy, please create an issue on our{' '}
          <a
            className="text-primary hover:underline"
            href="https://github.com/Stormix/deadlock-modmanager"
          >
            GitHub repository
          </a>
          .
        </p>
      </div>
    </div>
  );
};

export default PrivacyPage;
