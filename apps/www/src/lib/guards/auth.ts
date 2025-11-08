import { createServerFn } from "@tanstack/react-start";
import { getSession } from "./utils";

export const checkAuth = createServerFn().handler(async () => {
  const session = await getSession();
  return {
    isLoggedIn: !!session?.data?.user,
    isAdmin: !!session?.data?.user?.isAdmin,
  };
});
