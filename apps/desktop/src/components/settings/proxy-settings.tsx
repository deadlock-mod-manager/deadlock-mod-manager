import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Activity,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
  ShieldCheck,
} from "@deadlock-mods/ui/icons";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { syncProxyConfigToBackend } from "@/lib/proxy";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PROXY_CONFIG,
  type ProxyConfig,
  type ProxyProtocol,
} from "@/lib/store/slices/network";

const PORT_MIN = 1;
const PORT_MAX = 65535;

const isPortValid = (port: number) =>
  Number.isInteger(port) && port >= PORT_MIN && port <= PORT_MAX;

const validate = (
  draft: ProxyConfig,
): { ok: boolean; hostError?: string; portError?: string } => {
  if (!draft.enabled) return { ok: true };
  const hostError = draft.host.trim().length === 0 ? "required" : undefined;
  const portError = isPortValid(draft.port) ? undefined : "invalid";
  return { ok: !hostError && !portError, hostError, portError };
};

const isEqual = (a: ProxyConfig, b: ProxyConfig) =>
  a.enabled === b.enabled &&
  a.protocol === b.protocol &&
  a.host === b.host &&
  a.port === b.port &&
  a.authEnabled === b.authEnabled &&
  a.username === b.username &&
  a.password === b.password &&
  a.noProxy === b.noProxy;

export const ProxySettings = () => {
  const { t } = useTranslation();
  const proxyConfig = usePersistedStore((state) => state.proxyConfig);
  const setProxyConfig = usePersistedStore((state) => state.setProxyConfig);

  const [draft, setDraft] = useState<ProxyConfig>(proxyConfig);
  const [showPassword, setShowPassword] = useState(false);

  // Re-sync draft if the persisted config changes from outside this form
  // (e.g. store rehydration), but only when the user hasn't started editing.
  useEffect(() => {
    setDraft((current) =>
      isEqual(current, proxyConfig) ? current : proxyConfig,
    );
    // We intentionally only react to proxyConfig changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxyConfig]);

  const dirty = useMemo(
    () => !isEqual(draft, proxyConfig),
    [draft, proxyConfig],
  );
  const validation = useMemo(() => validate(draft), [draft]);

  const update = (updates: Partial<ProxyConfig>) =>
    setDraft((d) => ({ ...d, ...updates }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      setProxyConfig(draft);
      await syncProxyConfigToBackend();
    },
    onSuccess: () => {
      toast.success(t("settings.proxySaved"));
    },
    onError: (error) => {
      toast.error(
        t("settings.proxySaveFailed", { error: (error as Error).message }),
      );
    },
  });

  const reset = () => {
    setDraft(proxyConfig);
  };

  const restoreDefaults = () => {
    setDraft(DEFAULT_PROXY_CONFIG);
  };

  const testMutation = useMutation({
    mutationFn: () =>
      invoke<string>("test_proxy_connection", { config: draft }),
    onSuccess: (latency) => {
      toast.success(t("settings.proxyTestSuccess", { latency }));
    },
    onError: (error) => {
      toast.error(
        t("settings.proxyTestFailed", { error: (error as Error).message }),
      );
    },
  });

  const status: "active" | "disabled" | "unsaved" = dirty
    ? "unsaved"
    : proxyConfig.enabled
      ? "active"
      : "disabled";

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-start justify-between gap-4 rounded-lg border bg-card/40 p-4'>
        <div className='flex items-start gap-3'>
          <ShieldCheck
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0",
              draft.enabled ? "text-primary" : "text-muted-foreground",
            )}
          />
          <div className='flex flex-col gap-1'>
            <div className='flex items-center gap-2'>
              <Label
                className='font-semibold text-sm'
                htmlFor='toggle-proxy-enabled'>
                {t("settings.proxyEnable")}
              </Label>
              <StatusPill status={status} />
            </div>
            <p className='text-muted-foreground text-sm'>
              {t("settings.proxyEnableDescription")}
            </p>
          </div>
        </div>
        <Switch
          checked={draft.enabled}
          id='toggle-proxy-enabled'
          onCheckedChange={(enabled) => update({ enabled })}
        />
      </div>

      {draft.enabled && (
        <div className='flex flex-col gap-5 rounded-lg border bg-card/40 p-4'>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr_140px]'>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='proxy-protocol'>
                {t("settings.proxyProtocol")}
              </Label>
              <Select
                onValueChange={(value: ProxyProtocol) =>
                  update({ protocol: value })
                }
                value={draft.protocol}>
                <SelectTrigger id='proxy-protocol'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='http'>HTTP</SelectItem>
                  <SelectItem value='https'>HTTPS</SelectItem>
                  <SelectItem value='socks5'>SOCKS5</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='proxy-host'>{t("settings.proxyHost")}</Label>
              <Input
                aria-invalid={Boolean(validation.hostError)}
                autoComplete='off'
                id='proxy-host'
                name='proxy-host'
                onChange={(e) => update({ host: e.target.value })}
                placeholder='127.0.0.1'
                spellCheck={false}
                value={draft.host}
              />
              {validation.hostError ? (
                <p className='text-destructive text-xs'>
                  {t("settings.proxyHostRequired")}
                </p>
              ) : null}
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='proxy-port'>{t("settings.proxyPort")}</Label>
              <Input
                aria-invalid={Boolean(validation.portError)}
                id='proxy-port'
                inputMode='numeric'
                max={PORT_MAX}
                min={PORT_MIN}
                name='proxy-port'
                onChange={(e) =>
                  update({ port: Number(e.target.value.replace(/\D/g, "")) })
                }
                placeholder='8080'
                type='number'
                value={Number.isFinite(draft.port) ? draft.port : ""}
              />
              {validation.portError ? (
                <p className='text-destructive text-xs'>
                  {t("settings.proxyPortInvalid")}
                </p>
              ) : null}
            </div>
          </div>

          <div className='flex items-start justify-between gap-4 border-t pt-4'>
            <div className='flex flex-col gap-1'>
              <Label
                className='font-semibold text-sm'
                htmlFor='toggle-proxy-auth'>
                {t("settings.proxyAuth")}
              </Label>
              <p className='text-muted-foreground text-sm'>
                {t("settings.proxyAuthDescription")}
              </p>
            </div>
            <Switch
              checked={draft.authEnabled}
              id='toggle-proxy-auth'
              onCheckedChange={(authEnabled) => update({ authEnabled })}
            />
          </div>

          {draft.authEnabled && (
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='proxy-username'>
                  {t("settings.proxyUsername")}
                </Label>
                <Input
                  autoComplete='off'
                  id='proxy-username'
                  name='proxy-username'
                  onChange={(e) => update({ username: e.target.value })}
                  placeholder={t("settings.proxyUsernamePlaceholder")}
                  spellCheck={false}
                  value={draft.username}
                />
              </div>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='proxy-password'>
                  {t("settings.proxyPassword")}
                </Label>
                <div className='relative'>
                  <Input
                    autoComplete='new-password'
                    className='pr-10'
                    id='proxy-password'
                    name='proxy-password'
                    onChange={(e) => update({ password: e.target.value })}
                    placeholder={t("settings.proxyPasswordPlaceholder")}
                    type={showPassword ? "text" : "password"}
                    value={draft.password}
                  />
                  <button
                    aria-label={
                      showPassword
                        ? t("settings.proxyHidePassword")
                        : t("settings.proxyShowPassword")
                    }
                    className='absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground'
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    type='button'>
                    {showPassword ? (
                      <EyeOff className='h-4 w-4' />
                    ) : (
                      <Eye className='h-4 w-4' />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className='flex flex-col gap-2 border-t pt-4'>
            <Label htmlFor='proxy-no-proxy'>{t("settings.proxyBypass")}</Label>
            <Input
              autoComplete='off'
              id='proxy-no-proxy'
              name='proxy-no-proxy'
              onChange={(e) => update({ noProxy: e.target.value })}
              placeholder='localhost, 127.0.0.1, .local'
              spellCheck={false}
              value={draft.noProxy}
            />
            <p className='text-muted-foreground text-xs'>
              {t("settings.proxyBypassDescription")}
            </p>
          </div>
        </div>
      )}

      <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3'>
        <Button
          disabled={
            testMutation.isPending ||
            !draft.enabled ||
            !validation.ok ||
            draft.host.trim().length === 0
          }
          onClick={() => testMutation.mutate()}
          type='button'
          variant='secondary'>
          <Activity className='h-4 w-4' />
          {testMutation.isPending
            ? t("settings.proxyTesting")
            : t("settings.proxyTestConnection")}
        </Button>

        <div className='flex flex-wrap items-center gap-2'>
          <Button
            disabled={!dirty && isEqual(draft, DEFAULT_PROXY_CONFIG)}
            onClick={restoreDefaults}
            type='button'
            variant='ghost'>
            {t("settings.proxyRestoreDefaults")}
          </Button>
          <Button
            disabled={!dirty || saveMutation.isPending}
            onClick={reset}
            type='button'
            variant='outline'>
            <RotateCcw className='h-4 w-4' />
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!dirty || !validation.ok || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            type='button'>
            <Save className='h-4 w-4' />
            {saveMutation.isPending
              ? t("settings.proxySaving")
              : t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
};

const StatusPill = ({
  status,
}: {
  status: "active" | "disabled" | "unsaved";
}) => {
  const { t } = useTranslation();
  if (status === "active") {
    return (
      <Badge
        className='border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        variant='outline'>
        <span className='size-1.5 rounded-full bg-emerald-500' aria-hidden />
        {t("settings.proxyStatusActive")}
      </Badge>
    );
  }
  if (status === "unsaved") {
    return (
      <Badge
        className='border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
        variant='outline'>
        <span className='size-1.5 rounded-full bg-amber-500' aria-hidden />
        {t("settings.proxyStatusUnsaved")}
      </Badge>
    );
  }
  return (
    <Badge variant='outline'>
      <span
        className='size-1.5 rounded-full bg-muted-foreground/50'
        aria-hidden
      />
      {t("settings.proxyStatusDisabled")}
    </Badge>
  );
};
