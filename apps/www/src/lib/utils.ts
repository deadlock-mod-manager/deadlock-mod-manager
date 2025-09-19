import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDownloads(downloads: number): string {
  if (downloads >= 1_000_000) return `${(downloads / 1_000_000).toFixed(1)}M`;
  if (downloads >= 1000) return `${(downloads / 1000).toFixed(1)}k`;
  return downloads.toString();
}
