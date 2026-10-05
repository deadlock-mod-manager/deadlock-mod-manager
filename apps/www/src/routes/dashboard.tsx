import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { checkAuth } from "@/lib/guards/auth";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
  head: () =>
    seo({
      title: "Dashboard | Deadlock Mod Manager",
      noindex: true,
    }),
  beforeLoad: async ({ location }) => {
    const { isLoggedIn, isAdmin } = await checkAuth();
    if (!isLoggedIn) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
    if (!isAdmin) {
      throw redirect({
        to: "/403",
      });
    }
  },
});

function DashboardLayout() {
  return (
    <div className='flex flex-col gap-8 px-4'>
      <Outlet />
    </div>
  );
}
