import type { ModDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  LuArrowLeft,
  LuCalendar,
  LuDownload,
  LuExternalLink,
  LuHeart,
  LuUser,
} from "react-icons/lu";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { ModDescription } from "@/components/mods/mod-description";
import { NSFWBlur } from "@/components/mods/nsfw-blur";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { generateDeepLink, isDeepLinkSupported } from "@/lib/deep-link";
import { formatDownloads } from "@/lib/utils";
import Logo from "@/logo.svg";
import { orpc } from "@/utils/orpc";
import { serverClient } from "@/utils/orpc.server";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/mod/$id")({
  component: ModDetailPage,
  loader: async ({ params }) => {
    const mod = await serverClient.getModV2({ id: params.id });
    return mod;
  },
  head: (ctx) => {
    const mod = ctx.loaderData as ModDto;
    if (!mod) {
      return seo({
        title: "Mod Not Found | Deadlock Mod Manager",
      });
    }

    const title = `${mod.name} by ${mod.author} | Deadlock Mod Manager`;
    const description =
      mod.description ||
      `Download ${mod.name} by ${mod.author} for Valve's Deadlock game. ${mod.downloadCount.toLocaleString()} downloads.`;
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

    const image = mod.images?.[0];
    const seoTags = seo({
      title,
      description,
      keywords,
      ...(image && { image }),
      url,
      canonical: url,
      type: "article",
      author: mod.author,
    });

    return {
      ...seoTags,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: mod.name,
            description: description,
            ...(image && { image }),
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
            ...(mod.likes > 0
              ? {
                  aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue:
                      mod.likes <= 20 ? "3" : mod.likes <= 50 ? "4" : "5",
                    ratingCount: mod.likes,
                  },
                }
              : {}),
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
      meta: [
        ...(seoTags.meta || []),
        {
          property: "article:published_time",
          content: publishedTime,
        },
        {
          property: "article:modified_time",
          content: modifiedTime,
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

  const [selectedDownloadIndex, setSelectedDownloadIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const deepLinkSupported = isDeepLinkSupported();
  const { shouldBlur, nsfwSettings } = useNSFWBlur(mod);

  const handleDownload = () => {
    if (!mod || !downloads?.downloads || downloads.downloads.length === 0) {
      return;
    }

    const download = downloads.downloads[selectedDownloadIndex];
    const deepLink = generateDeepLink(
      download.url,
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
        <div className='space-y-6 lg:col-span-2'>
          {mod.images && mod.images.length > 0 && (
            <NSFWBlur
              isNSFW={shouldBlur}
              blurStrength={nsfwSettings.blurStrength}
              disableBlur={nsfwSettings.disableBlur}>
              <div
                className='aspect-video overflow-hidden rounded-lg cursor-pointer'
                onClick={() => {
                  setLightboxIndex(0);
                  setLightboxOpen(true);
                }}>
                <img
                  src={mod.images[0]}
                  alt={mod.name}
                  className='h-full w-full object-cover transition-transform hover:scale-105'
                />
              </div>
            </NSFWBlur>
          )}

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

          {mod.description && (
            <Card>
              <CardContent className='pt-6'>
                <h2 className='mb-4 font-semibold text-xl'>Description</h2>
                <ModDescription description={mod.description} />
              </CardContent>
            </Card>
          )}

          {mod.images && mod.images.length > 1 && (
            <Card>
              <CardContent className='pt-6'>
                <h2 className='mb-4 font-semibold text-xl'>Gallery</h2>
                <div className='grid grid-cols-2 gap-4'>
                  {mod.images.slice(1).map((image: string, index: number) => (
                    <NSFWBlur
                      key={image}
                      isNSFW={shouldBlur}
                      blurStrength={nsfwSettings.blurStrength}
                      disableBlur={nsfwSettings.disableBlur}>
                      <div
                        className='aspect-video overflow-hidden rounded-lg cursor-pointer'
                        onClick={() => {
                          setLightboxIndex(index + 1);
                          setLightboxOpen(true);
                        }}>
                        <img
                          src={image}
                          alt={`${mod.name} screenshot`}
                          className='h-full w-full object-cover transition-transform hover:scale-105'
                        />
                      </div>
                    </NSFWBlur>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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

        <div className='space-y-6'>
          <Card>
            <CardContent className='pt-6'>
              <h2 className='mb-4 font-semibold text-xl'>Download</h2>
              <div className='space-y-3'>
                {/* File Selection - Show when multiple files available */}
                {downloads?.downloads && downloads.downloads.length > 1 && (
                  <div className='space-y-2'>
                    <label className='text-muted-foreground text-sm font-medium'>
                      Select file to download:
                    </label>
                    <div className='space-y-2'>
                      {downloads.downloads.map((download, index) => (
                        <button
                          key={download.url}
                          type='button'
                          onClick={() => setSelectedDownloadIndex(index)}
                          className={`flex w-full items-center justify-between rounded-md border p-3 text-left text-sm transition-colors ${
                            selectedDownloadIndex === index
                              ? "border-primary bg-primary/10"
                              : "border-border hover:bg-muted"
                          }`}>
                          <span className='truncate font-medium'>
                            {download.name}
                          </span>
                          <span className='ml-2 text-muted-foreground text-xs whitespace-nowrap'>
                            {(download.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {deepLinkSupported ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className='w-full text-base'
                          style={{ backgroundColor: "#EBDBC3", color: "#000" }}
                          size='lg'
                          onClick={() => handleDownload()}
                          disabled={
                            !downloads?.downloads ||
                            downloads.downloads.length === 0
                          }>
                          <img
                            src={Logo}
                            alt='Mod Manager'
                            className='mr-2 h-6 w-6'
                          />
                          Install with Deadlock Mod Manager
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className='max-w-xs text-sm'>
                          This will open the Deadlock Mod Manager desktop app
                          and start the download automatically.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <>
                    <p className='text-muted-foreground text-sm'>
                      To install this mod automatically, you need the Deadlock
                      Mod Manager desktop app.
                    </p>
                    <Link to='/download'>
                      <Button className='w-full' size='lg'>
                        <LuDownload className='mr-2 h-4 w-4' />
                        Get Desktop App
                      </Button>
                    </Link>
                  </>
                )}

                {downloads?.downloads && downloads.downloads.length > 0 && (
                  <Button
                    variant='outline'
                    className='w-full'
                    size='lg'
                    asChild>
                    <a
                      href={downloads.downloads[selectedDownloadIndex].url}
                      target='_blank'
                      rel='noopener noreferrer'>
                      <LuDownload className='mr-2 h-4 w-4' />
                      Download Manually
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

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
                    View original post on GameBanana
                  </Button>
                </a>
              </CardContent>
            </Card>
          )}

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

      {mod.images && mod.images.length > 0 && (
        <Lightbox
          open={lightboxOpen}
          close={() => setLightboxOpen(false)}
          index={lightboxIndex}
          slides={mod.images.map((image) => ({ src: image }))}
        />
      )}
    </div>
  );
}
