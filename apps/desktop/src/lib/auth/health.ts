import { fetch } from "../fetch";
import { AUTH_URL } from "@/lib/config";

export interface AuthHealthData {
  status: string;
  db: { alive: boolean; error?: string };
  version: string;
}

export async function getAuthHealth(): Promise<AuthHealthData> {
  const response = await fetch(`${AUTH_URL}/health`, { method: "GET" });

  if (!response.ok) {
    throw new Error(`Auth health check failed: ${response.status}`);
  }

  return response.json() as Promise<AuthHealthData>;
}
