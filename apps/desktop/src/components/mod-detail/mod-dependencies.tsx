import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { ExternalLink, Info, Package } from "@deadlock-mods/ui/icons";
import { useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import ModButton from "@/components/mod-browsing/mod-button";
import { prefetchModDetail } from "@/lib/mods/mod-detail-prefetch";
import type { ModDependency, ResolvedDependency } from "@/types/dependencies";

interface ModDependenciesProps {
  dependencies: ResolvedDependency[];
}

export const ModDependencies = ({ dependencies }: ModDependenciesProps) => {
  const { t } = useTranslation();

  if (!dependencies || dependencies.length === 0) {
    return null;
  }

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Package className='h-5 w-5' />
          {t("modDependencies.title")}
        </CardTitle>
        <CardDescription>{t("modDependencies.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className='space-y-2'>
          {dependencies.map((dependency) =>
            dependency.kind === "internal" ? (
              <InternalDependencyRow
                dependency={dependency}
                key={dependency.mod.remoteId}
              />
            ) : (
              <ExternalDependencyRow
                dependency={dependency}
                key={dependency.dependency.url || dependency.dependency.label}
              />
            ),
          )}
        </ul>
      </CardContent>
    </Card>
  );
};

const LevelBadge = ({ level }: { level: ModDependency["level"] }) => {
  const { t } = useTranslation();
  if (level === "required") {
    return (
      <Badge
        className='shrink-0 border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400'
        variant='outline'>
        {t("modDependencies.required")}
      </Badge>
    );
  }
  if (level === "recommended") {
    return (
      <Badge className='shrink-0 text-muted-foreground' variant='outline'>
        {t("modDependencies.recommended")}
      </Badge>
    );
  }
  return null;
};

const InternalDependencyRow = ({
  dependency,
}: {
  dependency: Extract<ResolvedDependency, { kind: "internal" }>;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mod } = dependency;
  const level = dependency.dependency.level;
  const image = mod.images?.[0];

  const goToMod = () => {
    prefetchModDetail(queryClient, mod.remoteId);
    navigate(`/mods/${mod.remoteId}`);
  };

  return (
    <li className='flex items-center gap-2 rounded-lg border p-2 transition-colors hover:bg-muted/50'>
      <button
        className='flex min-w-0 flex-1 items-center gap-3 rounded-md p-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        onClick={goToMod}
        type='button'>
        <Avatar className='h-11 w-11 rounded-md'>
          <AvatarImage alt={mod.name} className='object-cover' src={image} />
          <AvatarFallback className='rounded-md'>
            <Package className='h-5 w-5 text-muted-foreground' />
          </AvatarFallback>
        </Avatar>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            {level === "required" && <LevelBadge level='required' />}
            <span className='truncate font-medium' title={mod.name}>
              {mod.name}
            </span>
            {level === "recommended" && <LevelBadge level='recommended' />}
          </div>
          <p className='truncate text-muted-foreground text-sm'>
            {t("mods.by")} {mod.author}
          </p>
        </div>
      </button>

      <div className='flex shrink-0 items-center pr-1'>
        <ModButton remoteMod={mod} variant='default' />
      </div>
    </li>
  );
};

const ExternalDependencyRow = ({
  dependency,
}: {
  dependency: Extract<ResolvedDependency, { kind: "external" }>;
}) => {
  const { t } = useTranslation();
  const { label } = dependency.dependency;
  const url = dependency.dependency.url;
  const level = dependency.dependency.level;

  // No link, so it's just a note
  if (!url) {
    return (
      <li className='flex items-center gap-3 rounded-lg border p-3'>
        <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-secondary'>
          <Info className='h-5 w-5 text-muted-foreground' />
        </div>
        <div className='flex min-w-0 flex-1 items-center gap-2'>
          {level === "required" && <LevelBadge level='required' />}
          <span className='font-medium'>{label}</span>
          {level === "recommended" && <LevelBadge level='recommended' />}
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        className='flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50'
        onClick={() => openUrl(url)}
        title={url}
        type='button'>
        <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-secondary'>
          <ExternalLink className='h-5 w-5 text-muted-foreground' />
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            {level === "required" && <LevelBadge level='required' />}
            <span className='truncate font-medium'>
              {label || t("modDependencies.openExternal")}
            </span>
            {level === "recommended" && <LevelBadge level='recommended' />}
          </div>
          <p className='truncate text-muted-foreground text-sm'>{url}</p>
        </div>
        <ExternalLink className='h-4 w-4 shrink-0 text-muted-foreground' />
      </button>
    </li>
  );
};
