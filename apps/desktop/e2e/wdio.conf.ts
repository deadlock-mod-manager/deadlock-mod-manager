import path from "node:path";

interface TauriCapability {
  browserName: "tauri";
  "tauri:options": {
    application: string;
    args: string[];
  };
}

type TauriWdioConfig = Omit<WebdriverIO.Config, "capabilities"> & {
  capabilities: TauriCapability[];
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0)
    throw new Error(`${name} is required`);
  return value;
};

const provider = requiredEnvironment("DMM_E2E_PROVIDER");
if (provider !== "embedded" && provider !== "external") {
  throw new Error(`Unsupported DMM_E2E_PROVIDER '${provider}'`);
}
const binaryPath = path.resolve(requiredEnvironment("DMM_E2E_BINARY"));
const artifacts = path.resolve(requiredEnvironment("DMM_E2E_ARTIFACTS"));

export const config: TauriWdioConfig = {
  runner: "local",
  specs: ["./specs/about.e2e.ts"],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: binaryPath,
        args: ["--disable-auto-update"],
      },
    },
  ],
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath: binaryPath,
        appArgs: ["--disable-auto-update"],
        driverProvider: provider,
        autoInstallTauriDriver: false,
        // v1.3.0 performs this preflight before branching on the provider.
        // Keeping it enabled prevents an embedded run from aborting on the
        // machine-global EdgeDriver that only the external provider needs.
        autoDownloadEdgeDriver: true,
        captureBackendLogs: true,
        captureFrontendLogs: false,
        startTimeout: 60_000,
        statusPollTimeout: 5_000,
      },
    ],
  ],
  logLevel: "warn",
  bail: 0,
  waitforTimeout: 15_000,
  connectionRetryTimeout: 60_000,
  connectionRetryCount: 0,
  framework: "mocha",
  reporters: [["spec", { addConsoleLogs: true }]],
  mochaOpts: { ui: "bdd", timeout: 45_000 },
  afterTest: async (
    test: { title: string },
    _context: object,
    result: { passed: boolean },
  ): Promise<void> => {
    if (!result.passed) {
      const name = test.title.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
      await browser.saveScreenshot(path.join(artifacts, `${name}.png`));
    }
  },
};
