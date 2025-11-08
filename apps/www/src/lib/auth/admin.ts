import { authClient } from "./client";

/**
 * Check if the current user is an admin
 * @returns Promise<boolean> - true if user is admin, false otherwise
 */
export async function checkIsAdmin(): Promise<boolean> {
  const session = await authClient.getSession();

  if (!session?.data?.user) {
    return false;
  }

  return session.data.user.isAdmin === true;
}
