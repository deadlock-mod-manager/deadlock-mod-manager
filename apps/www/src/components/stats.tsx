import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
};

export const StatsSection = () => {
  const statsQuery = useQuery(orpc.getStats.queryOptions());
  const stats = statsQuery.data;

  const statsData = [
    {
      id: 1,
      name: "Available Mods",
      value: stats ? formatNumber(stats.totalMods) : "...",
    },
    {
      id: 2,
      name: "Mod Downloads",
      value: stats ? `${formatNumber(stats.modDownloads)}+` : "...",
    },
    {
      id: 3,
      name: "App Downloads",
      value: stats ? `${formatNumber(stats.appDownloads)}+` : "...",
    },
  ];

  return (
    <div
      className='bg-background px-4 py-16 sm:px-6 sm:py-24 lg:py-32'
      id='stats'>
      <div className='mx-auto max-w-7xl lg:px-8'>
        <div className='mx-auto max-w-2xl lg:max-w-none'>
          <div className='text-center'>
            <h2 className='mb-2 text-center text-lg text-primary tracking-wider'>
              Stats
            </h2>
            <h2 className='font-semibold font-primary text-3xl text-balance text-foreground tracking-tight sm:text-4xl lg:text-5xl'>
              By the numbers
            </h2>
            <p className='mt-4 text-base text-muted-foreground sm:text-lg/8'>
              A growing library of mods and an active community making Deadlock
              better every day.
            </p>
          </div>
          <dl className='mt-12 grid grid-cols-1 gap-0.5 overflow-hidden rounded-2xl text-center sm:mt-16 lg:grid-cols-3'>
            {statsData.map((stat) => (
              <div
                key={stat.id}
                className='flex flex-col bg-white/[0.05] p-6 backdrop-blur-sm sm:p-8'>
                <dt className='font-semibold text-muted-foreground text-sm/6'>
                  {stat.name}
                </dt>
                <dd className='order-first font-semibold font-primary text-3xl text-foreground tracking-tight'>
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
};
