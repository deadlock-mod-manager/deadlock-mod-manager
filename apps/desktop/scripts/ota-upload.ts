import * as path from "node:path";
import { $ } from "bun";

const main = async () => {
  const baseDir = process.cwd();
  const packageJsonPath = path.join(baseDir, "package.json");
  const tauriConfPath = path.join(baseDir, "src-tauri", "tauri.conf.json");

  const pkg = JSON.parse(await Bun.file(packageJsonPath).text()) as {
    version: string;
  };
  const version = pkg.version;

  interface TauriConf {
    version: string;
    [key: string]: string | number | boolean | null | TauriConf | TauriConf[];
  }
  const tauriConf = JSON.parse(
    await Bun.file(tauriConfPath).text(),
  ) as TauriConf;
  tauriConf.version = version;
  await Bun.write(tauriConfPath, JSON.stringify(tauriConf, null, 2));

  const prodEnv = {
    ...process.env,
    VITE_API_URL: "https://api.deadlockmods.app",
    VITE_WEB_URL: "https://deadlockmods.app",
    VITE_AUTH_URL: "https://auth.deadlockmods.app",
  };

  try {
    $.cwd(baseDir);

    $.env(prodEnv);
    await $`pnpm ui:build`;

    $.env(process.env);
    await $`dotenv -e ../../.env -- pnpx @crabnebula/ota-updater upload`;
  } finally {
    const conf = JSON.parse(await Bun.file(tauriConfPath).text()) as TauriConf;
    conf.version = "../package.json";
    await Bun.write(tauriConfPath, JSON.stringify(conf, null, 2));
  }
};

main();
