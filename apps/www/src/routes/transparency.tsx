import { PhosphorIcons } from "@deadlock-mods/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { orpc } from "@/utils/orpc";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/transparency")({
  component: TransparencyComponent,
  head: () =>
    seo({
      title: "Transparency | Deadlock Mod Manager",
      description:
        "Financial transparency, platform statistics, and project values for Deadlock Mod Manager - an open-source community project.",
    }),
});

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
};

function TransparencyComponent() {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const statsQuery = useQuery(orpc.getTransparencyStats.queryOptions());

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const infrastructureCosts = [
    {
      service: "Cloudflare",
      description: "SSL, CDN, DNS, and DDoS protection",
      cost: 10,
      since: new Date(2024, 11, 1),
    },
    {
      service: "PlanetScale",
      description: "Serverless database (deprecated as of 2026-02-08)",
      cost: 25,
      since: new Date(2026, 0, 1),
      until: new Date(2026, 1, 1),
    },
    {
      service: "VPS Hosting",
      description:
        "Kubernetes cluster (3 control planes, 6 workers) + Storage Volumes",
      cost: 100,
      since: new Date(2024, 11, 1),
    },
    {
      service: "Domain",
      description: "deadlockmods.app",
      cost: 25 / 12,
      since: new Date(2024, 11, 1),
    },
    {
      service: "Domain",
      description: "deadlockmods.com",
      cost: 30 / 12,
      since: new Date(2024, 11, 1),
    },
    {
      service: "Cursor AI",
      description: "AI-powered coding assistant",
      cost: 70,
      since: new Date(2025, 5, 1),
    },
  ];

  const totalMonthlyCost = infrastructureCosts.reduce(
    (sum, item) => sum + item.cost,
    0,
  );

  const projectStartDate = new Date(2024, 11, 1); // December 2024
  const now = new Date();
  const monthsRunning =
    (now.getFullYear() - projectStartDate.getFullYear()) * 12 +
    (now.getMonth() - projectStartDate.getMonth());

  const totalInvested = infrastructureCosts.reduce((sum, item) => {
    const startMonth =
      (item.since.getFullYear() - projectStartDate.getFullYear()) * 12 +
      (item.since.getMonth() - projectStartDate.getMonth());
    const endMonth = item.until
      ? (item.until.getFullYear() - projectStartDate.getFullYear()) * 12 +
        (item.until.getMonth() - projectStartDate.getMonth())
      : monthsRunning;
    const activeMonths = Math.max(0, endMonth - startMonth);
    return sum + item.cost * activeMonths;
  }, 0);

  const projectValues = [
    {
      icon: PhosphorIcons.CodeIcon,
      title: "Open Source",
      description:
        "All code is publicly available on GitHub. Anyone can contribute, audit, or fork the project.",
    },
    {
      icon: PhosphorIcons.ShieldCheckIcon,
      title: "Privacy First",
      description:
        "We collect minimal data and respect your privacy. Analytics can be disabled at any time.",
    },
    {
      icon: PhosphorIcons.UsersIcon,
      title: "Community Driven",
      description:
        "Built by the community, for the community. Your feedback shapes the project's direction.",
    },
    {
      icon: PhosphorIcons.XCircleIcon,
      title: "No External Funding",
      description:
        "Self-funded with no external funding. No pressure to monetize or compromise values.",
    },
    {
      icon: PhosphorIcons.InfinityIcon,
      title: "Free Forever",
      description:
        "No premium tiers, no paywalls, no subscriptions. Everything is free and always will be.",
    },
  ];

  return (
    <div className='min-h-screen bg-background'>
      <div className='container mx-auto max-w-6xl py-12'>
        <div className='mb-12 text-center'>
          <h1 className='mb-4 font-bold font-primary text-5xl tracking-tight'>
            Transparency
          </h1>
          <p className='text-muted-foreground text-xl'>
            Financial transparency, platform statistics, and project values
          </p>
          <div className='mx-auto mt-6 h-1 w-24 bg-primary'></div>
          <p className='text-muted-foreground text-sm mt-4'>
            Last updated: February 8, 2025
          </p>
        </div>

        <div className='grid gap-8 lg:grid-cols-4'>
          <aside className='lg:col-span-1'>
            <div className='sticky top-8 rounded-lg border bg-card p-6'>
              <h2 className='mb-4 font-semibold text-lg'>Table of Contents</h2>
              <nav className='space-y-2'>
                {[
                  { id: "values", title: "1. Our Values" },
                  { id: "stats", title: "2. Platform Statistics" },
                  { id: "costs", title: "3. Infrastructure Costs" },
                  { id: "revenue", title: "4. Revenue & Funding" },
                  { id: "support", title: "5. Support the Project" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => scrollToSection(item.id)}
                    className='block w-full text-left text-muted-foreground text-sm transition-colors hover:text-primary'>
                    {item.title}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          <main className='lg:col-span-3'>
            <div className='space-y-12'>
              <section className='scroll-mt-8' id='values'>
                <h2 className='text-2xl font-semibold border-b border-border pb-2 mb-6'>
                  1. Our Values
                </h2>
                <p className='text-muted-foreground leading-relaxed mb-6'>
                  Deadlock Mod Manager is built on core principles that guide
                  every decision we make. These values ensure the project
                  remains true to its community-first mission.
                </p>
                <div className='grid gap-4 sm:grid-cols-2'>
                  {projectValues.map((value) => (
                    <div
                      key={value.title}
                      className='rounded-lg border bg-card p-6 transition-colors hover:border-primary/50'>
                      <value.icon
                        className='h-8 w-8 text-primary mb-3'
                        weight='duotone'
                      />
                      <h3 className='font-semibold text-lg mb-2'>
                        {value.title}
                      </h3>
                      <p className='text-muted-foreground text-sm leading-relaxed'>
                        {value.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className='scroll-mt-8' id='stats'>
                <h2 className='text-2xl font-semibold border-b border-border pb-2 mb-6'>
                  2. Platform Statistics
                </h2>
                <p className='text-muted-foreground leading-relaxed mb-6'>
                  Real-time statistics showing the growth and usage of Deadlock
                  Mod Manager. All data is updated automatically from our API.
                </p>

                {statsQuery.isLoading ? (
                  <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className='rounded-lg border bg-card p-6 animate-pulse'>
                        <div className='h-4 bg-muted rounded w-24 mb-2'></div>
                        <div className='h-8 bg-muted rounded w-16'></div>
                      </div>
                    ))}
                  </div>
                ) : statsQuery.error ? (
                  <div className='rounded-lg border-l-4 border-red-500 bg-red-500/10 p-4'>
                    <p className='text-sm text-muted-foreground'>
                      Failed to load statistics. Please try again later.
                    </p>
                  </div>
                ) : (
                  <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                    {[
                      {
                        label: "Total Mods",
                        value: statsQuery.data?.totalMods || 0,
                      },
                      {
                        label: "Mod Downloads",
                        value: statsQuery.data?.modDownloads || 0,
                        suffix: "+",
                      },
                      {
                        label: "App Downloads",
                        value: statsQuery.data?.appDownloads || 0,
                        suffix: "+",
                      },
                      {
                        label: "Registered Users",
                        value: statsQuery.data?.totalUsers || 0,
                      },
                      {
                        label: "Mod Files",
                        value: statsQuery.data?.totalModFiles || 0,
                      },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className='rounded-lg border bg-card p-6 transition-colors hover:border-primary/50'>
                        <dt className='font-semibold text-muted-foreground text-sm mb-2'>
                          {stat.label}
                        </dt>
                        <dd className='font-semibold font-primary text-3xl text-foreground tracking-tight'>
                          {formatNumber(stat.value)}
                          {stat.suffix}
                        </dd>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className='scroll-mt-8' id='costs'>
                <h2 className='text-2xl font-semibold border-b border-border pb-2 mb-6'>
                  3. Infrastructure Costs
                </h2>
                <p className='text-muted-foreground leading-relaxed mb-6'>
                  Complete breakdown of monthly infrastructure costs. All values
                  are in USD and updated monthly.
                </p>

                <div className='rounded-lg border bg-card overflow-hidden'>
                  <div className='divide-y divide-border'>
                    {infrastructureCosts.map((item) => (
                      <div
                        key={`${item.service}-${item.description}`}
                        className='flex items-center justify-between p-4 hover:bg-muted/50 transition-colors'>
                        <div className='flex-1'>
                          <h3 className='font-semibold text-foreground'>
                            {item.service}
                          </h3>
                          <p className='text-muted-foreground text-sm'>
                            {item.description}
                          </p>
                        </div>
                        <div className='font-mono font-semibold text-foreground text-lg ml-4'>
                          €{item.cost.toFixed(2)}
                          <span className='text-muted-foreground text-sm'>
                            /mo
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className='flex items-center justify-between p-4 bg-primary/10'>
                      <h3 className='font-bold text-foreground text-lg'>
                        Total Monthly Cost
                      </h3>
                      <div className='font-mono font-bold text-primary text-xl'>
                        €{totalMonthlyCost.toFixed(2)}
                        <span className='text-muted-foreground text-sm'>
                          /mo
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className='rounded-lg border-l-4 border-blue-500 bg-blue-500/10 p-4 mt-4'>
                  <p className='text-sm text-muted-foreground'>
                    <strong className='text-foreground'>
                      Cost Optimization:
                    </strong>{" "}
                    We use free tiers where possible (Cloudflare, PlanetScale)
                    and optimize infrastructure to keep costs minimal while
                    maintaining reliability.
                  </p>
                </div>
              </section>

              <section className='scroll-mt-8' id='revenue'>
                <h2 className='text-2xl font-semibold border-b border-border pb-2 mb-6'>
                  4. Revenue & Funding
                </h2>

                <div className='grid gap-4 sm:grid-cols-2 mb-6'>
                  <div className='rounded-lg border bg-card p-6 text-center'>
                    <PhosphorIcons.CurrencyDollarIcon
                      className='h-10 w-10 text-muted-foreground mx-auto mb-3'
                      weight='duotone'
                    />
                    <p className='font-bold font-primary text-3xl text-foreground tracking-tight'>
                      €0
                    </p>
                    <p className='text-muted-foreground text-sm mt-1'>
                      Revenue generated
                    </p>
                  </div>
                  <div className='rounded-lg border bg-card p-6 text-center'>
                    <PhosphorIcons.WalletIcon
                      className='h-10 w-10 text-primary mx-auto mb-3'
                      weight='duotone'
                    />
                    <p className='font-bold font-primary text-3xl text-primary tracking-tight'>
                      ~€{totalInvested.toFixed(0)}
                    </p>
                    <p className='text-muted-foreground text-sm mt-1'>
                      Estimated total invested ({monthsRunning} months)
                    </p>
                  </div>
                </div>

                <div className='rounded-lg border bg-card p-6'>
                  <p className='text-muted-foreground leading-relaxed mb-4'>
                    Deadlock Mod Manager generates zero revenue. There are no
                    advertisements, premium features, data tracking, or any form
                    of monetization. The project is entirely self-funded by the
                    maintainer.
                  </p>
                  <p className='text-muted-foreground leading-relaxed'>
                    <strong className='text-foreground'>
                      Self-Funded Since December 2024:
                    </strong>{" "}
                    All infrastructure costs have been paid out of pocket for{" "}
                    {monthsRunning} months. This ensures the project remains
                    independent, free from external influence, and aligned with
                    community interests.
                  </p>
                </div>
              </section>

              <section className='scroll-mt-8' id='support'>
                <h2 className='text-2xl font-semibold border-b border-border pb-2 mb-6'>
                  5. Support the Project
                </h2>
                <div className='rounded-lg border-l-4 border-primary bg-primary/10 p-6'>
                  <div className='flex items-start gap-4'>
                    <PhosphorIcons.HeartIcon
                      className='h-8 w-8 text-primary flex-shrink-0 mt-1'
                      weight='duotone'
                    />
                    <div>
                      <h3 className='font-semibold text-lg text-foreground mb-2'>
                        Donations Coming Soon
                      </h3>
                      <p className='text-muted-foreground leading-relaxed mb-4'>
                        While the project is currently self-funded, we're
                        exploring options for community support through
                        platforms like GitHub Sponsors, Ko-fi, or Open
                        Collective.
                      </p>
                      <p className='text-muted-foreground leading-relaxed mb-4'>
                        Any donations received will go directly toward:
                      </p>
                      <ul className='space-y-2 text-muted-foreground ml-4'>
                        <li className='list-disc'>
                          Infrastructure costs (hosting, database, domains)
                        </li>
                        <li className='list-disc'>
                          Development tools and services
                        </li>
                        <li className='list-disc'>
                          Improving documentation and community resources
                        </li>
                      </ul>
                      <p className='text-muted-foreground text-sm mt-4'>
                        <strong className='text-foreground'>Note:</strong> The
                        project will always remain free and open source,
                        regardless of funding status. Donations are optional and
                        never required.
                      </p>
                    </div>
                  </div>
                </div>

                <div className='rounded-lg border bg-card p-6 mt-4'>
                  <h3 className='font-semibold text-lg mb-4'>
                    Other Ways to Support
                  </h3>
                  <div className='space-y-3 text-muted-foreground'>
                    <div className='flex items-start gap-3'>
                      <PhosphorIcons.GithubLogoIcon className='h-5 w-5 text-primary flex-shrink-0 mt-0.5' />
                      <p>
                        <strong className='text-foreground'>
                          Star us on GitHub:
                        </strong>{" "}
                        Show your support by starring the{" "}
                        <a
                          href='https://github.com/deadlock-mod-manager/deadlock-mod-manager'
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-primary hover:underline'>
                          repository
                        </a>
                      </p>
                    </div>
                    <div className='flex items-start gap-3'>
                      <PhosphorIcons.ChatCircleIcon className='h-5 w-5 text-primary flex-shrink-0 mt-0.5' />
                      <p>
                        <strong className='text-foreground'>
                          Spread the word:
                        </strong>{" "}
                        Share the project with other Deadlock players and mod
                        creators
                      </p>
                    </div>
                    <div className='flex items-start gap-3'>
                      <PhosphorIcons.CodeIcon className='h-5 w-5 text-primary flex-shrink-0 mt-0.5' />
                      <p>
                        <strong className='text-foreground'>
                          Contribute code:
                        </strong>{" "}
                        Help improve the project by contributing on{" "}
                        <a
                          href='https://github.com/deadlock-mod-manager/deadlock-mod-manager'
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-primary hover:underline'>
                          GitHub
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </main>
        </div>

        {showBackToTop && (
          <button
            onClick={scrollToTop}
            className='fixed right-8 bottom-8 z-50 rounded-full bg-primary p-3 text-primary-foreground shadow-lg transition-all hover:scale-110 hover:bg-primary/90'
            aria-label='Back to top'>
            <PhosphorIcons.ArrowUpIcon className='h-5 w-5' />
          </button>
        )}
      </div>
    </div>
  );
}
