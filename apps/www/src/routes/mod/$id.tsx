import { Button } from "@deadlock-mods/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LuExternalLink } from "react-icons/lu";
import { seo } from "@/utils/seo";

const GAMEBANANA_DEADLOCK_URL = "https://gamebanana.com/games/20948";

const goneDocument = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mod page retired | Deadlock Mod Manager</title>
  </head>
  <body style="font-family:system-ui,sans-serif;max-width:42rem;margin:5rem auto;padding:0 1.5rem;line-height:1.6">
    <h1>This mod page has been retired</h1>
    <p>Deadlock Mod Manager now discovers submissions directly from GameBanana. Older links did not preserve whether an ID referred to a mod or a sound, so redirecting them could open the wrong submission.</p>
    <p><a href="${GAMEBANANA_DEADLOCK_URL}">Browse Deadlock submissions on GameBanana</a></p>
    <p><a href="/">Return to Deadlock Mod Manager</a></p>
  </body>
</html>`;

export const Route = createFileRoute("/mod/$id")({
  component: RetiredModPage,
  head: () =>
    seo({
      title: "Mod Page Retired | Deadlock Mod Manager",
      description:
        "Deadlock Mod Manager now discovers mod and sound submissions directly from GameBanana.",
      noindex: true,
    }),
  server: {
    handlers: {
      GET: () =>
        new Response(goneDocument, {
          status: 410,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});

function RetiredModPage() {
  return (
    <main className='container mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center gap-6 px-4 py-16'>
      <div className='space-y-3'>
        <p className='font-medium text-muted-foreground text-sm'>410 Gone</p>
        <h1 className='font-bold text-4xl'>This mod page has been retired</h1>
        <p className='text-lg text-muted-foreground'>
          Deadlock Mod Manager now discovers submissions directly from
          GameBanana. Older links did not preserve whether an ID referred to a
          mod or a sound, so redirecting could open the wrong submission.
        </p>
      </div>
      <div className='flex flex-wrap gap-3'>
        <Button asChild>
          <a
            href={GAMEBANANA_DEADLOCK_URL}
            rel='noopener noreferrer'
            target='_blank'>
            Browse on GameBanana
            <LuExternalLink className='ml-2 h-4 w-4' />
          </a>
        </Button>
        <Button asChild variant='outline'>
          <Link to='/'>Return home</Link>
        </Button>
      </div>
    </main>
  );
}
