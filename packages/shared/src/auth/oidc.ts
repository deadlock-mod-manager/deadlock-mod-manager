import type { OIDCState } from "./types";

export function parseOIDCState(stateParam: string | null): OIDCState {
  if (!stateParam) {
    return { returnTo: "/" };
  }

  try {
    return JSON.parse(atob(stateParam)) as OIDCState;
  } catch {
    return { returnTo: "/" };
  }
}
