import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getLatestVersion = async () => {
  const response = await fetch(
    'https://github.com/Stormix/deadlock-modmanager/releases/latest/download/latest.json',
    {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json' },
    }
  );

  if (!response.ok) {
    return 'unknown';
  }
  const data = await response.json();
  return data.version;
};
