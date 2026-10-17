import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Card } from "@deadlock-mods/ui/components/card";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  CloudOff,
  Inbox,
  RefreshCw,
  TriangleAlert,
  UserRound,
} from "@deadlock-mods/ui/icons";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { DashboardWidget } from "@/lib/stats/dashboard/layout";
import { cn } from "@/lib/utils";
import { useDashboardData } from "./dashboard-context";
import { panelDef } from "./panels";
import {
  useHistoryGate,
  useWidgetData,
  type WidgetDataState,
} from "./use-widget-data";
import { useWidgetTitle } from "./use-widget-title";
import { WidgetChart } from "./widget-chart";

export type WidgetHealth = "ok" | "broken";

interface WidgetContentProps {
  widget: DashboardWidget;
  /** Reports whether the widget can currently show its data. */
  onHealth?: (widgetId: string, health: WidgetHealth) => void;
  /** Rendered in the card header, right of the title (edit controls). */
  actions?: ReactNode;
}

const Notice = ({
  icon: Icon,
  title,
  description,
  tone = "muted",
  children,
}: {
  icon: typeof Inbox;
  title: string;
  description?: string;
  tone?: "muted" | "broken";
  children?: ReactNode;
}) => (
  <div
    className={cn(
      "flex h-full min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-md p-3 text-center",
      tone === "broken" && "bg-destructive/5",
    )}
    role={tone === "broken" ? "alert" : undefined}>
    <Icon
      className={cn(
        "h-5 w-5",
        tone === "broken" ? "text-destructive" : "text-muted-foreground",
      )}
    />
    <p className='font-medium text-sm'>{title}</p>
    {description && (
      <p className='max-w-sm text-muted-foreground text-xs leading-relaxed'>
        {description}
      </p>
    )}
    {children}
  </div>
);

const BrokenNotice = ({
  state,
}: {
  state: Extract<WidgetDataState, { status: "broken" }>;
}) => {
  const { t } = useTranslation();
  return (
    <Notice
      description={t(`stats.dashboard.broken.${state.reason}`, {
        endpoint: state.endpoint ?? "-",
        status: state.httpStatus ?? "-",
        fields: state.missing?.join(", ") ?? "",
      })}
      icon={state.reason === "network" ? CloudOff : TriangleAlert}
      title={t("stats.dashboard.broken.title")}
      tone='broken'>
      {state.endpoint && (
        <code className='rounded bg-muted px-1.5 py-0.5 text-[11px]'>
          {state.endpoint}
        </code>
      )}
      {state.retry && (
        <Button
          className='mt-1 h-7 gap-1.5 text-xs'
          onClick={state.retry}
          size='sm'
          variant='outline'>
          <RefreshCw className='h-3 w-3' />
          {t("stats.dashboard.broken.retry")}
        </Button>
      )}
    </Notice>
  );
};

const DataStateView = ({
  state,
  widget,
}: {
  state: WidgetDataState;
  widget: DashboardWidget;
}) => {
  const { t } = useTranslation();
  switch (state.status) {
    case "loading":
      return <Skeleton className='h-full min-h-[96px] w-full rounded-md' />;
    case "needsAccount":
      return (
        <Notice
          description={t("stats.dashboard.needsAccountDescription")}
          icon={UserRound}
          title={t("stats.dashboard.needsAccount")}
        />
      );
    case "empty":
      return <Notice icon={Inbox} title={t("stats.dashboard.empty")} />;
    case "broken":
      return <BrokenNotice state={state} />;
    case "ready":
      return widget.view ? (
        <WidgetChart dataset={state.dataset} view={widget.view} />
      ) : null;
  }
};

const useHealthReport = (
  widgetId: string,
  broken: boolean,
  onHealth: WidgetContentProps["onHealth"],
) => {
  useEffect(() => {
    onHealth?.(widgetId, broken ? "broken" : "ok");
  }, [widgetId, broken, onHealth]);
};

const DataWidget = ({ widget, onHealth, actions }: WidgetContentProps) => {
  const { t } = useTranslation();
  const titleOf = useWidgetTitle();
  const state = useWidgetData(widget.source, widget.view);
  useHealthReport(widget.id, state.status === "broken", onHealth);

  return (
    <Card
      className={cn(
        "flex h-full min-h-0 flex-col gap-2 p-4 shadow-none",
        state.status === "broken" && "border-destructive/40",
      )}
      data-widget-state={state.status}>
      <div className='flex min-h-6 items-start justify-between gap-2'>
        <h3 className='min-w-0 truncate font-semibold text-sm'>
          {titleOf(widget)}
        </h3>
        <div className='flex shrink-0 items-center gap-1'>
          {state.status === "ready" && state.isStale && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className='h-5 text-[10px]' variant='secondary'>
                  {t("stats.dashboard.stale")}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{t("stats.dashboard.staleHint")}</TooltipContent>
            </Tooltip>
          )}
          {actions}
        </div>
      </div>
      <div className='min-h-0 flex-1'>
        <DataStateView state={state} widget={widget} />
      </div>
    </Card>
  );
};

/**
 * A built-in panel. It brings its own cards, so it is not framed again - the
 * default tabs look exactly like they did before the dashboard became editable.
 */
const PanelWidget = ({ widget, onHealth, actions }: WidgetContentProps) => {
  const { t } = useTranslation();
  const data = useDashboardData();
  const panelId = widget.source.kind === "panel" ? widget.source.panel : "";
  const panel = panelDef(panelId);

  const historyGate = useHistoryGate();
  const state = ((): WidgetDataState | null => {
    if (!panel) {
      return { status: "broken", reason: "unknownSource", endpoint: null };
    }
    if (panel.needsHistory) {
      return historyGate;
    }
    return panel.needsAccount && data.accountId === null
      ? { status: "needsAccount" }
      : null;
  })();
  useHealthReport(widget.id, state?.status === "broken", onHealth);

  const body = (() => {
    if (state || !panel) {
      return (
        <DataStateView state={state ?? { status: "empty" }} widget={widget} />
      );
    }
    if (panel.needsAccount) {
      return data.accountId === null
        ? null
        : panel.render({ ...data, accountId: data.accountId });
    }
    return panel.render(data);
  })();

  if (!actions && !state) {
    return <div className='h-full'>{body}</div>;
  }

  return (
    <Card
      className={cn(
        "flex h-full min-h-0 flex-col gap-2 p-3 shadow-none",
        state?.status === "broken" && "border-destructive/40",
      )}>
      <div className='flex min-h-6 items-center justify-between gap-2'>
        <h3 className='min-w-0 truncate font-semibold text-sm'>
          {widget.title.trim() ||
            t(`stats.dashboard.panels.${panelId}.title`, {
              defaultValue: panelId,
            })}
        </h3>
        <div className='flex shrink-0 items-center gap-1'>{actions}</div>
      </div>
      <div className='min-h-0 flex-1 overflow-auto'>{body}</div>
    </Card>
  );
};

export const WidgetContent = (props: WidgetContentProps) =>
  props.widget.source.kind === "panel" ? (
    <PanelWidget {...props} />
  ) : (
    <DataWidget {...props} />
  );
