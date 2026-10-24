import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// Only the fullscreen element's subtree is painted in fullscreen, so floating
// content portaled to <body> would stay invisible.
export const portalContainer = () => document.fullscreenElement ?? undefined;
