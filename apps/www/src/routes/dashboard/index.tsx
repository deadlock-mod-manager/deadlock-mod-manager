import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className='container mx-auto px-4 py-8'>
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>Welcome to the admin dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground'>
            This is the dashboard home page. Use the sidebar to navigate to
            different sections.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
