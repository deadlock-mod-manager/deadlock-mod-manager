import { ProviderError } from "@deadlock-mods/common";

export async function assertGameBananaResponseOk(
  response: Response,
): Promise<void> {
  if (response.ok) return;
  const body = await response.text();
  throw new ProviderError(`HTTP ${response.status}: ${body.slice(0, 2048)}`);
}
