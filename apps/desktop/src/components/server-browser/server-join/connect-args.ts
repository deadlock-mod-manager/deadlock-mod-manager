import type { ServerBrowserEntry } from "@deadlock-mods/shared";

const IPV4_PORT_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/;
const HOSTNAME_PORT_RE =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+:(\d{1,5})$/i;
const LOBBY_ID_RE = /^\[?(\d{6,20})\]?$/;
const SAFE_PASSWORD_RE = /^[\x21-\x7e]+$/;
const UNSAFE_PASSWORD_CHARS_RE = /["';+]/;

const isSafePassword = (password: string): boolean =>
  SAFE_PASSWORD_RE.test(password) && !UNSAFE_PASSWORD_CHARS_RE.test(password);

const isValidPort = (port: string): boolean => {
  const value = Number(port);
  return Number.isInteger(value) && value > 0 && value <= 65535;
};

export const normalizeConnectCode = (
  raw: string | undefined,
): string | null => {
  const code = (raw ?? "").trim();
  if (!code) return null;

  const lobby = LOBBY_ID_RE.exec(code);
  if (lobby) return `[${lobby[1]}]`;

  const ipv4 = IPV4_PORT_RE.exec(code);
  if (ipv4) {
    const octetsOk = ipv4
      .slice(1, 5)
      .every((octet) => Number(octet) >= 0 && Number(octet) <= 255);
    return octetsOk && isValidPort(ipv4[5]) ? code : null;
  }

  const hostname = HOSTNAME_PORT_RE.exec(code);
  if (hostname) {
    const port = code.slice(code.lastIndexOf(":") + 1);
    return isValidPort(port) ? code : null;
  }

  return null;
};

export type ConnectArgs = {
  code: string;
  args: string;
  passwordSkipped: boolean;
};

export const buildConnectArgs = (
  server: ServerBrowserEntry,
  password: string,
): ConnectArgs | null => {
  const code = normalizeConnectCode(server.connect_code);
  if (!code) return null;

  const parts = [`+connect ${code}`];
  let passwordSkipped = false;

  if (server.password_protected && password) {
    if (isSafePassword(password)) {
      parts.push(`+password ${password}`);
    } else {
      passwordSkipped = true;
    }
  }

  return { code, args: parts.join(" "), passwordSkipped };
};
