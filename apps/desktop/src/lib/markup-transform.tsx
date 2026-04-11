import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import type { NavigateFunction } from "react-router";

import { getMod } from "@/lib/api";
import { queryClient } from "@/lib/client";
import i18n from "@/lib/i18n";

const GAMEBANANA_HOST_SUFFIX = ".gamebanana.com";

const isGameBananaHost = (hostname: string): boolean =>
  hostname === "gamebanana.com" || hostname.endsWith(GAMEBANANA_HOST_SUFFIX);

const parseHrefToUrl = (href: string): URL | null => {
  try {
    return new URL(href);
  } catch {
    try {
      return new URL(href, "https://gamebanana.com/");
    } catch {
      return null;
    }
  }
};

const parseGameBananaCatalogModRemoteId = (href: string): string | null => {
  const url = parseHrefToUrl(href);
  if (!url) return null;
  if (!isGameBananaHost(url.hostname)) return null;

  const segments = url.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length !== 2 || segments[0] !== "mods") return null;

  const id = segments[1];
  return /^\d+$/.test(id) ? id : null;
};

const copyDescriptionSnippet = async (raw: string) => {
  const text = raw.replace(/\u00a0/g, " ").trimEnd();
  if (text.length === 0) return;

  try {
    await navigator.clipboard.writeText(text);
    toast.success(i18n.t("settings.copiedToClipboard"));
  } catch {
    toast.error(i18n.t("common.error"));
  }
};

const handleCopyableKeyDown = (
  event: React.KeyboardEvent<HTMLElement>,
  getText: () => string,
) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  void copyDescriptionSnippet(getText());
};

const CopyableSnippet = ({
  tag: Tag,
  className,
  children,
  getText,
  copyTitle,
  stopPropagation,
}: {
  tag: "pre" | "code";
  className: string;
  children: ReactNode[];
  getText: () => string;
  copyTitle: string;
  stopPropagation?: boolean;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Tag
        className={className}
        role='button'
        tabIndex={0}
        onClick={(e: React.MouseEvent) => {
          if (stopPropagation) e.stopPropagation();
          void copyDescriptionSnippet(getText());
        }}
        onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
          handleCopyableKeyDown(e, getText);
          if (stopPropagation && (e.key === "Enter" || e.key === " "))
            e.stopPropagation();
        }}>
        {children}
      </Tag>
    </TooltipTrigger>
    <TooltipContent>{copyTitle}</TooltipContent>
  </Tooltip>
);

export const createMarkupLinkTransform = (navigate: NavigateFunction) => {
  const copyTitle = i18n.t("settings.copyToClipboardTooltip");

  return (node: HTMLElement, children: ReactNode[]): ReactNode => {
    if (node.tagName === "PRE") {
      return (
        <CopyableSnippet
          tag='pre'
          className={node.className}
          getText={() => node.textContent ?? ""}
          copyTitle={copyTitle}>
          {children}
        </CopyableSnippet>
      );
    }

    if (node.tagName === "CODE") {
      const parentTag = node.parentElement?.tagName;
      if (parentTag === "PRE" || parentTag === "A") return undefined;

      return (
        <CopyableSnippet
          tag='code'
          className={node.className}
          getText={() => node.textContent ?? ""}
          copyTitle={copyTitle}
          stopPropagation>
          {children}
        </CopyableSnippet>
      );
    }

    if (node.tagName !== "A") return undefined;

    const href = node.getAttribute("href");
    if (!href) return undefined;

    const openExternal = () => void openUrl(href);

    return (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            openExternal();
            return;
          }
          const remoteId = parseGameBananaCatalogModRemoteId(href);
          if (!remoteId) {
            openExternal();
            return;
          }
          void (async () => {
            try {
              await queryClient.fetchQuery({
                queryKey: ["mod", remoteId],
                queryFn: () => getMod(remoteId),
                staleTime: 30_000,
              });
              navigate(`/mods/${remoteId}`);
            } catch {
              openExternal();
            }
          })();
        }}
        className='cursor-pointer break-words font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary/90'>
        {children}
      </a>
    );
  };
};
