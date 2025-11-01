import type { ModDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@deadlock-mods/ui/components/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  LuArrowLeft,
  LuCalendar,
  LuDownload,
  LuExternalLink,
  LuHeart,
  LuUser,
} from "react-icons/lu";
import { ModDescription } from "@/components/mods/mod-description";
import { generateDeepLink, isDeepLinkSupported } from "@/lib/deep-link";
import { formatDownloads } from "@/lib/utils";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/mod/$id")({
  component: ModDetailPage,
  loader: async ({ params, context }) => {
    const mod = await context.queryClient.ensureQueryData(
      orpc.getModV2.queryOptions({ input: { id: params.id } }),
    );
    return mod;
  },
  head: (ctx) => {
    const mod = ctx.loaderData;
    if (!mod) {
      return {
        meta: [
          {
            charSet: "utf-8",
          },
          {
            name: "viewport",
            content: "width=device-width, initial-scale=1",
          },
          {
            title: "Mod Not Found - Deadlock Mod Manager",
          },
        ],
      };
    }

    const title = `${mod.name} - Deadlock Mod Manager`;
    const description =
      mod.description ||
      `Download ${mod.name} by ${mod.author} for Valve's Deadlock game. ${mod.downloadCount.toLocaleString()} downloads.`;
    const image = mod.images?.[0] || "/og-image.png";
    const url = `https://deadlockmods.app/mod/${mod.remoteId}`;

    const keywords = [
      "deadlock mod",
      mod.category,
      mod.hero,
      mod.author,
      mod.isAudio ? "audio mod" : null,
      mod.isNSFW ? "nsfw" : null,
    ]
      .filter(Boolean)
      .join(", ");

    const publishedTime = mod.createdAt
      ? typeof mod.createdAt === "string"
        ? mod.createdAt
        : mod.createdAt.toISOString()
      : new Date().toISOString();
    const modifiedTime = mod.updatedAt
      ? typeof mod.updatedAt === "string"
        ? mod.updatedAt
        : mod.updatedAt.toISOString()
      : mod.createdAt
        ? typeof mod.createdAt === "string"
          ? mod.createdAt
          : mod.createdAt.toISOString()
        : new Date().toISOString();

    return {
      meta: [
        {
          charSet: "utf-8",
        },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
        },
        {
          title,
        },
        {
          name: "description",
          content: description,
        },
        {
          name: "keywords",
          content: keywords,
        },
        {
          name: "author",
          content: mod.author,
        },
        {
          property: "og:title",
          content: title,
        },
        {
          property: "og:description",
          content: description,
        },
        {
          property: "og:type",
          content: "article",
        },
        {
          property: "og:url",
          content: url,
        },
        {
          property: "og:image",
          content: image,
        },
        {
          property: "og:image:alt",
          content: `${mod.name} preview`,
        },
        {
          property: "article:author",
          content: mod.author,
        },
        {
          property: "article:published_time",
          content: publishedTime,
        },
        {
          property: "article:modified_time",
          content: modifiedTime,
        },
        {
          property: "twitter:card",
          content: "summary_large_image",
        },
        {
          property: "twitter:title",
          content: title,
        },
        {
          property: "twitter:description",
          content: description,
        },
        {
          property: "twitter:image",
          content: image,
        },
      ],
      links: [
        {
          rel: "canonical",
          href: url,
        },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: mod.name,
            description: description,
            image: image,
            author: {
              "@type": "Person",
              name: mod.author,
            },
            applicationCategory: "Game Modification",
            operatingSystem: "Windows, macOS, Linux",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
            },
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: mod.likes > 0 ? "5" : "0",
              ratingCount: mod.likes,
            },
            interactionStatistic: {
              "@type": "InteractionCounter",
              interactionType: "https://schema.org/DownloadAction",
              userInteractionCount: mod.downloadCount,
            },
            datePublished: publishedTime,
            dateModified: modifiedTime,
          }),
        },
      ],
    };
  },
});

function ModDetailPage() {
  const { id } = Route.useParams();
  const mod = Route.useLoaderData() as ModDto;
  const { data: downloads } = useQuery(
    orpc.getModDownloadsV2.queryOptions({ input: { id } }),
  );

  const deepLinkSupported = isDeepLinkSupported();

  const handleDownload = () => {
    if (!mod || !downloads?.downloads || downloads.downloads.length === 0) {
      return;
    }

    const largestDownload = downloads.downloads.reduce((prev, current) =>
      current.size > prev.size ? current : prev,
    );

    const deepLink = generateDeepLink(
      largestDownload.url,
      mod.isAudio ?? false,
      mod.remoteId,
    );

    window.location.href = deepLink;
  };

  if (!mod) {
    return (
      <div className='container mx-auto px-4 py-8'>
        <div className='mb-8'>
          <Link to='/mods'>
            <Button variant='ghost' size='sm'>
              <LuArrowLeft className='mr-2 h-4 w-4' />
              Back to Mods
            </Button>
          </Link>
        </div>
        <div className='space-y-6'>
          <div className='h-[400px] animate-pulse rounded-lg bg-muted' />
          <div className='h-[200px] animate-pulse rounded-lg bg-muted' />
        </div>
      </div>
    );
  }

  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mb-8'>
        <Link to='/mods'>
          <Button variant='ghost' size='sm'>
            <LuArrowLeft className='mr-2 h-4 w-4' />
            Back to Mods
          </Button>
        </Link>
      </div>

      <div className='grid gap-8 lg:grid-cols-3'>
        {/* Main Content */}
        <div className='space-y-6 lg:col-span-2'>
          {/* Hero Image */}
          {mod.images && mod.images.length > 0 && (
            <div className='aspect-video overflow-hidden rounded-lg'>
              <img
                src={mod.images[0]}
                alt={mod.name}
                className='h-full w-full object-cover'
              />
            </div>
          )}

          {/* Title and Stats */}
          <div>
            <h1 className='mb-4 font-bold text-4xl'>{mod.name}</h1>
            <div className='flex flex-wrap items-center gap-4 text-muted-foreground'>
              <div className='flex items-center gap-2'>
                <LuUser className='h-4 w-4' />
                <span>{mod.author}</span>
              </div>
              <div className='flex items-center gap-2'>
                <LuDownload className='h-4 w-4' />
                <span>{formatDownloads(mod.downloadCount)} downloads</span>
              </div>
              <div className='flex items-center gap-2'>
                <LuHeart className='h-4 w-4 text-red-500' />
                <span>{mod.likes} likes</span>
              </div>
              <div className='flex items-center gap-2'>
                <LuCalendar className='h-4 w-4' />
                <span>
                  Updated{" "}
                  {mod.updatedAt
                    ? new Date(mod.updatedAt).toLocaleDateString()
                    : "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className='flex flex-wrap gap-2'>
            <Badge variant='secondary'>{mod.category}</Badge>
            {mod.hero && <Badge variant='outline'>{mod.hero}</Badge>}
            {mod.isAudio && (
              <Badge
                variant='outline'
                className='border-purple-500/50 bg-purple-500/10 text-purple-500'>
                Audio Mod
              </Badge>
            )}
            {mod.isNSFW && (
              <Badge
                variant='outline'
                className='border-red-500/50 bg-red-500/10 text-red-500'>
                NSFW
              </Badge>
            )}
          </div>

          {/* Description */}
          {mod.description && (
            <Card>
              <CardContent className='pt-6'>
                <h2 className='mb-4 font-semibold text-xl'>Description</h2>
                <ModDescription description={mod.description} />
              </CardContent>
            </Card>
          )}

          {/* Gallery */}
          {mod.images && mod.images.length > 1 && (
            <Card>
              <CardContent className='pt-6'>
                <h2 className='mb-4 font-semibold text-xl'>Gallery</h2>
                <div className='grid grid-cols-2 gap-4'>
                  {mod.images.slice(1).map((image: string) => (
                    <div
                      key={image}
                      className='aspect-video overflow-hidden rounded-lg'>
                      <img
                        src={image}
                        alt={`${mod.name} screenshot`}
                        className='h-full w-full object-cover transition-transform hover:scale-105'
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Audio Preview */}
          {mod.audioUrl && (
            <Card>
              <CardContent className='pt-6'>
                <h2 className='mb-4 font-semibold text-xl'>Audio Preview</h2>
                <audio controls className='w-full'>
                  <source src={mod.audioUrl} type='audio/mpeg' />
                  Your browser does not support the audio element.
                </audio>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className='space-y-6'>
          {/* Download Card */}
          <Card>
            <CardContent className='pt-6'>
              <h2 className='mb-4 font-semibold text-xl'>Download</h2>
              {deepLinkSupported ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        className='w-full'
                        size='lg'
                        onClick={handleDownload}
                        disabled={
                          !downloads?.downloads ||
                          downloads.downloads.length === 0
                        }>
                        <LuDownload className='mr-2 h-4 w-4' />
                        Download Mod
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className='max-w-xs text-sm'>
                        This will open the Deadlock Mod Manager desktop app and
                        start the download automatically.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <div className='space-y-3'>
                  <p className='text-muted-foreground text-sm'>
                    To download this mod, you need to have the Deadlock Mod
                    Manager desktop app installed.
                  </p>
                  <Link to='/download'>
                    <Button className='w-full' size='lg'>
                      <LuDownload className='mr-2 h-4 w-4' />
                      Get Desktop App
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>

            {downloads?.downloads && downloads.downloads.length > 0 && (
              <CardFooter className='flex-col items-start gap-2'>
                <p className='text-muted-foreground text-sm'>
                  {downloads.downloads.length} file
                  {downloads.downloads.length > 1 ? "s" : ""} available
                </p>
                <div className='w-full space-y-2'>
                  {downloads.downloads.map((download) => (
                    <div
                      key={download.url}
                      className='flex items-center justify-between rounded-md border p-3 text-sm'>
                      <span className='truncate'>{download.name}</span>
                      <span className='text-muted-foreground text-xs'>
                        {(download.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  ))}
                </div>
              </CardFooter>
            )}
          </Card>

          {/* External Links */}
          {mod.remoteUrl && (
            <Card>
              <CardContent className='pt-6'>
                <h2 className='mb-4 font-semibold text-xl'>Links</h2>
                <a
                  href={mod.remoteUrl}
                  target='_blank'
                  rel='noopener noreferrer'>
                  <Button variant='outline' className='w-full justify-start'>
                    <LuExternalLink className='mr-2 h-4 w-4' />
                    View on GameBanana
                  </Button>
                </a>
              </CardContent>
            </Card>
          )}

          {/* Mod Info */}
          <Card>
            <CardContent className='pt-6'>
              <h2 className='mb-4 font-semibold text-xl'>Information</h2>
              <dl className='space-y-3 text-sm'>
                <div>
                  <dt className='text-muted-foreground'>Created</dt>
                  <dd>
                    {mod.createdAt
                      ? new Date(mod.createdAt).toLocaleDateString()
                      : "N/A"}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>Last Updated</dt>
                  <dd>
                    {mod.updatedAt
                      ? new Date(mod.updatedAt).toLocaleDateString()
                      : "N/A"}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>Mod ID</dt>
                  <dd className='font-mono'>{mod.remoteId}</dd>
                </div>
                {mod.downloadable !== undefined && (
                  <div>
                    <dt className='text-muted-foreground'>Downloadable</dt>
                    <dd>{mod.downloadable ? "Yes" : "No"}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
