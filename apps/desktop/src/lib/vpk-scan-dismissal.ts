import { useSyncExternalStore } from "react";

const DISMISS_STORAGE_KEY = "vpk-scan-alert.dismissed-fingerprint";
const DISMISS_CHANGED_EVENT = "vpk-scan-alert.dismissal-changed";

export const getVpkScanFingerprint = (files: readonly string[]): string =>
  [...files].sort().join("|");

export const getDismissedVpkScanFingerprint = (): string | null =>
  window.localStorage.getItem(DISMISS_STORAGE_KEY);

export const subscribeToVpkScanDismissal = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === DISMISS_STORAGE_KEY || event.key === null) {
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(DISMISS_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(DISMISS_CHANGED_EVENT, onChange);
  };
};

export const dismissVpkScanAlert = (fingerprint: string) => {
  window.localStorage.setItem(DISMISS_STORAGE_KEY, fingerprint);
  window.dispatchEvent(new Event(DISMISS_CHANGED_EVENT));
};

export const restoreVpkScanAlert = () => {
  window.localStorage.removeItem(DISMISS_STORAGE_KEY);
  window.dispatchEvent(new Event(DISMISS_CHANGED_EVENT));
};

export const useVpkScanDismissal = () => ({
  dismissedFingerprint: useSyncExternalStore(
    subscribeToVpkScanDismissal,
    getDismissedVpkScanFingerprint,
    () => null,
  ),
  dismiss: dismissVpkScanAlert,
  restore: restoreVpkScanAlert,
});
