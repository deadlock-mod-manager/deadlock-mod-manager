import { fetch } from "../fetch";
import { AUTH_URL } from "@/lib/config";
import { HttpError } from "@/lib/http-error";
import { runtimeServiceOrigin } from "@/lib/runtime-bootstrap";

export interface AuthHealthData {
  status: string;
}

export async function getAuthHealth(): Promise<AuthHealthData> {
  const response = await fetch(
    `${runtimeServiceOrigin("auth", AUTH_URL)}/health`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    throw new HttpError("auth", response.status, "/health");
  }

  return response.json() as Promise<AuthHealthData>;
}
