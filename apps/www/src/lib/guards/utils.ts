import { getRequestHeaders } from "@tanstack/react-start/server";
import { authClient } from "../auth/client";

export const getSession = async () => {
  const headers = getRequestHeaders();
  const session = await authClient.getSession({
    fetchOptions: {
      headers,
    },
  });
  return session;
};
