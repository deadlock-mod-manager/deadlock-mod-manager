import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { STATUS_URL } from '@/lib/constants';

export const Route = createFileRoute('/status')({
  component: StatusComponent,
  head: () => ({
    meta: [
      {
        title: 'Status | Deadlock Mod Manager',
      },
      {
        name: 'description',
        content:
          'Check the status of Deadlock Mod Manager services and infrastructure.',
      },
    ],
  }),
});

function StatusComponent() {
  useEffect(() => {
    window.location.href = STATUS_URL;
  }, []);

  return (
    <div className="container mx-auto max-w-3xl py-12 text-center">
      <h1 className="mb-4 font-bold text-2xl">Redirecting to status page...</h1>
      <p className="text-muted-foreground">
        If you're not redirected automatically,{' '}
        <a className="text-primary hover:underline" href={STATUS_URL}>
          click here
        </a>
        .
      </p>
    </div>
  );
}
