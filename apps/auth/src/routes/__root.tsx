import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <div className='min-h-screen flex items-center justify-center bg-background'>
      <Outlet />
    </div>
  ),
});
