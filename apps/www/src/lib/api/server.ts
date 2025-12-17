import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createServerFn } from "@tanstack/react-start";
import type { AppRouterClient } from "../../../../api/src/routers/index";
import { ensureValidToken } from "../auth/server";
import { SERVER_URL } from "../config";

function createAuthenticatedClient(token: string | null): AppRouterClient {
  const link = new RPCLink({
    url: `${SERVER_URL}/rpc`,
    fetch(url, options) {
      const headers = new Headers((options as RequestInit)?.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return fetch(url, {
        ...(options as RequestInit | undefined),
        headers,
      });
    },
  });
  return createORPCClient(link);
}

// Analytics
export const getAnalytics = createServerFn({ method: "GET" })
  .inputValidator((data: { timeRange: string }) => data)
  .handler(async ({ data }) => {
    const token = await ensureValidToken();
    const client = createAuthenticatedClient(token);
    return client.getAnalytics({
      timeRange: data.timeRange as "1h" | "1d" | "7d" | "30d" | "90d" | "all",
    });
  });

// Announcements
export const listAllAnnouncements = createServerFn({ method: "GET" }).handler(
  async () => {
    const token = await ensureValidToken();
    const client = createAuthenticatedClient(token);
    return client.listAllAnnouncements();
  },
);

export const createAnnouncement = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { title: string; content: string; type: string }) => data,
  )
  .handler(async ({ data }) => {
    const token = await ensureValidToken();
    const client = createAuthenticatedClient(token);
    return client.createAnnouncement(
      data as Parameters<AppRouterClient["createAnnouncement"]>[0],
    );
  });

export const updateAnnouncement = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { id: string; title?: string; content?: string; type?: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const token = await ensureValidToken();
    const client = createAuthenticatedClient(token);
    return client.updateAnnouncement(
      data as Parameters<AppRouterClient["updateAnnouncement"]>[0],
    );
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const token = await ensureValidToken();
    const client = createAuthenticatedClient(token);
    return client.deleteAnnouncement(data);
  });

export const publishAnnouncement = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const token = await ensureValidToken();
    const client = createAuthenticatedClient(token);
    return client.publishAnnouncement(data);
  });

export const archiveAnnouncement = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const token = await ensureValidToken();
    const client = createAuthenticatedClient(token);
    return client.archiveAnnouncement(data);
  });
