import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { checkIsAdmin } from "@/lib/auth/admin";
import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session?.data?.session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: "/dashboard",
        },
      });
    }

    const isAdmin = await checkIsAdmin();
    if (!isAdmin) {
      throw redirect({
        to: "/",
      });
    }
  },
});

function DashboardLayout() {
  return <Outlet />;
}
