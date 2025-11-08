import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardChart } from "@/components/dashboard/chart";
import { PageHeader } from "@/components/dashboard/page-header";
import { SectionCards } from "@/components/dashboard/section-cards";
import { orpc } from "@/utils/orpc";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
  head: () =>
    seo({
      title: "Dashboard | Deadlock Mod Manager",
      noindex: true,
    }),
});

function DashboardPage() {
  const [timeRange, setTimeRange] = useState<
    "1h" | "1d" | "7d" | "30d" | "90d" | "all"
  >("7d");
  const analyticsQuery = useQuery(
    orpc.getAnalytics.queryOptions({ timeRange }),
  );
  const analyticsResponse = analyticsQuery.data;
  const analyticsData = analyticsResponse?.data || [];
  const totals = analyticsResponse?.totals;

  if (analyticsQuery.isLoading) {
    return (
      <div className='container mx-auto px-4 py-8'>
        <div className='mb-8'>
          <Card>
            <CardHeader>
              <CardTitle>Dashboard</CardTitle>
              <CardDescription>Welcome to the admin dashboard</CardDescription>
            </CardHeader>
            <CardContent>
              <p className='text-muted-foreground'>Loading analytics data...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className='flex items-center justify-between gap-4'>
        <PageHeader
          title='Metrics'
          description='Overview of platform metrics and analytics'
        />
        <Select
          value={timeRange}
          onValueChange={(value) =>
            setTimeRange(value as "1h" | "1d" | "7d" | "30d" | "90d" | "all")
          }>
          <SelectTrigger className='w-[180px]'>
            <SelectValue placeholder='Select time range' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All time</SelectItem>
            <SelectItem value='90d'>Last 3 months</SelectItem>
            <SelectItem value='30d'>Last 30 days</SelectItem>
            <SelectItem value='7d'>Last 7 days</SelectItem>
            <SelectItem value='1d'>Last day</SelectItem>
            <SelectItem value='1h'>Last hour</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <SectionCards
        data={analyticsData}
        timeRange={timeRange}
        totals={totals}
      />
      <div className='grid gap-6 md:grid-cols-3 lg:grid-cols-4'>
        <DashboardChart
          title='Total Mods'
          description='Number of mods added over time'
          dataKey='mods'
          color='hsl(var(--primary))'
          timeRange={timeRange}
        />
        <DashboardChart
          title='Mod Downloads'
          description='Total mod downloads over time'
          dataKey='downloads'
          color='hsl(var(--primary))'
          timeRange={timeRange}
        />
        <DashboardChart
          title='Users'
          description='New user registrations over time'
          dataKey='users'
          color='hsl(var(--primary))'
          timeRange={timeRange}
        />
        <DashboardChart
          title='Mod Files'
          description='Number of mod files added over time'
          dataKey='modFiles'
          color='hsl(var(--primary))'
          timeRange={timeRange}
        />
      </div>
    </>
  );
}
