import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { DISCORD_URL } from "@/lib/constants";

export const Route = createFileRoute("/discord")({
  component: DiscordComponent,
  head: () => ({
    meta: [
      {
        title: "Discord | Deadlock Mod Manager",
      },
      {
        name: "description",
        content:
          "Join the Deadlock Mod Manager Discord community for support, discussions, and updates.",
      },
    ],
  }),
});

function DiscordComponent() {
  useEffect(() => {
    window.location.href = DISCORD_URL;
  }, []);

  return (
    <div className='container mx-auto max-w-3xl py-12 text-center'>
      <h1 className='mb-4 font-bold font-primary text-2xl'>
        Redirecting to Discord...
      </h1>
      <p className='text-muted-foreground'>
        If you're not redirected automatically,{" "}
        <a className='text-primary hover:underline' href={DISCORD_URL}>
          click here
        </a>
        .
      </p>
    </div>
  );
}
