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
import { Activity } from "@deadlock-mods/ui/icons";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import type { ProxyConfig, ProxyProtocol } from "@/lib/store/slices/network";

const syncProxyToBackend = (config: ProxyConfig) =>
  invoke("set_proxy_config", {
    config: config.enabled ? config : null,
  });

export const ProxySettings = () => {
  const { t } = useTranslation();
  const proxyConfig = usePersistedStore((state) => state.proxyConfig);
  const setProxyConfig = usePersistedStore((state) => state.setProxyConfig);

  const updateProxy = useCallback(
    (updates: Partial<ProxyConfig>) => {
      const updated = { ...proxyConfig, ...updates };
      setProxyConfig(updated);
      syncProxyToBackend(updated);
    },
    [proxyConfig, setProxyConfig],
  );

  const testMutation = useMutation({
    mutationFn: () =>
      invoke<string>("test_proxy_connection", { config: proxyConfig }),
    onSuccess: (latency) => {
      toast.success(t("settings.proxyTestSuccess", { latency }));
    },
    onError: (error) => {
      toast.error(t("settings.proxyTestFailed", { error: error.message }));
    },
  });

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between'>
        <div className='space-y-1'>
          <Label className='font-bold text-sm'>
            {t("settings.proxyEnable")}
          </Label>
          <p className='text-muted-foreground text-sm'>
            {t("settings.proxyEnableDescription")}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Switch
            checked={proxyConfig.enabled}
            id='toggle-proxy-enabled'
            onCheckedChange={(enabled) => updateProxy({ enabled })}
          />
          <Label htmlFor='toggle-proxy-enabled'>
            {proxyConfig.enabled ? t("status.enabled") : t("status.disabled")}
          </Label>
        </div>
      </div>

      {proxyConfig.enabled && (
        <div className='flex flex-col gap-4 rounded-md border border-border p-4'>
          <div className='grid grid-cols-3 gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='proxy-protocol'>
                {t("settings.proxyProtocol")}
              </Label>
              <Select
                onValueChange={(value: ProxyProtocol) =>
                  updateProxy({ protocol: value })
                }
                value={proxyConfig.protocol}>
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

            <div className='space-y-2'>
              <Label htmlFor='proxy-host'>{t("settings.proxyHost")}</Label>
              <Input
                id='proxy-host'
                onChange={(e) => updateProxy({ host: e.target.value })}
                placeholder='127.0.0.1'
                value={proxyConfig.host}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='proxy-port'>{t("settings.proxyPort")}</Label>
              <Input
                id='proxy-port'
                max={65535}
                min={1}
                onChange={(e) => {
                  const port = Number.parseInt(e.target.value, 10);
                  if (!Number.isNaN(port)) {
                    updateProxy({ port });
                  }
                }}
                placeholder='8080'
                type='number'
                value={proxyConfig.port}
              />
            </div>
          </div>

          <div className='flex items-center justify-between'>
            <div className='space-y-1'>
              <Label className='font-bold text-sm'>
                {t("settings.proxyAuth")}
              </Label>
              <p className='text-muted-foreground text-sm'>
                {t("settings.proxyAuthDescription")}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <Switch
                checked={proxyConfig.authEnabled}
                id='toggle-proxy-auth'
                onCheckedChange={(authEnabled) => updateProxy({ authEnabled })}
              />
            </div>
          </div>

          {proxyConfig.authEnabled && (
            <div className='grid grid-cols-2 gap-4'>
              <div className='space-y-2'>
                <Label htmlFor='proxy-username'>
                  {t("settings.proxyUsername")}
                </Label>
                <Input
                  id='proxy-username'
                  onChange={(e) => updateProxy({ username: e.target.value })}
                  placeholder={t("settings.proxyUsernamePlaceholder")}
                  value={proxyConfig.username}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='proxy-password'>
                  {t("settings.proxyPassword")}
                </Label>
                <Input
                  id='proxy-password'
                  onChange={(e) => updateProxy({ password: e.target.value })}
                  placeholder={t("settings.proxyPasswordPlaceholder")}
                  type='password'
                  value={proxyConfig.password}
                />
              </div>
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='proxy-no-proxy'>{t("settings.proxyBypass")}</Label>
            <Input
              id='proxy-no-proxy'
              onChange={(e) => updateProxy({ noProxy: e.target.value })}
              placeholder='localhost, 127.0.0.1, .local'
              value={proxyConfig.noProxy}
            />
            <p className='text-muted-foreground text-xs'>
              {t("settings.proxyBypassDescription")}
            </p>
          </div>

          <div className='flex items-center gap-2'>
            <Button
              disabled={
                testMutation.isPending ||
                !proxyConfig.host ||
                proxyConfig.port <= 0
              }
              onClick={() => testMutation.mutate()}
              type='button'
              variant='secondary'>
              <Activity className='h-4 w-4' />
              {testMutation.isPending
                ? t("settings.proxyTesting")
                : t("settings.proxyTestConnection")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
