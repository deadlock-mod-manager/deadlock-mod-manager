import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";

export const transformMarkupLinks = (
  node: HTMLElement,
  children: ReactNode[],
): ReactNode | null => {
  if (node.tagName === "A") {
    const href = node.getAttribute("href");
    if (href) {
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            openUrl(href);
          }}
          className={node.className}>
          {children}
        </a>
      );
    }
  }
  return undefined;
};
