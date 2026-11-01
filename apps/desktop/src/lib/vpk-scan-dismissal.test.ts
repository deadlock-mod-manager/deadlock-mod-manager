import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  dismissVpkScanAlert,
  getDismissedVpkScanFingerprint,
  getVpkScanFingerprint,
  restoreVpkScanAlert,
  subscribeToVpkScanDismissal,
} from "./vpk-scan-dismissal";

const memory = new Map<string, string>();
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      localStorage: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => memory.set(key, value),
        removeItem: (key: string) => memory.delete(key),
      },
    }),
  });
});

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("unrecognized VPK alert dismissal", () => {
  it("lets Settings restore an alert and notifies mounted subscribers immediately", () => {
    const updates: (string | null)[] = [];
    const unsubscribe = subscribeToVpkScanDismissal(() => {
      updates.push(getDismissedVpkScanFingerprint());
    });
    const fingerprint = getVpkScanFingerprint(["stranger.vpk"]);

    dismissVpkScanAlert(fingerprint);
    expect(getDismissedVpkScanFingerprint()).toBe(fingerprint);
    restoreVpkScanAlert();

    expect(getDismissedVpkScanFingerprint()).toBeNull();
    expect(updates).toEqual([fingerprint, null]);
    unsubscribe();
    dismissVpkScanAlert(fingerprint);
    expect(updates).toHaveLength(2);
  });

  it("can undo dismissals saved by earlier app versions", () => {
    memory.set("vpk-scan-alert.dismissed-fingerprint", "stranger.vpk");

    expect(getDismissedVpkScanFingerprint()).toBe(
      getVpkScanFingerprint(["stranger.vpk"]),
    );
    restoreVpkScanAlert();

    expect(getDismissedVpkScanFingerprint()).toBeNull();
  });

  it("observes dismissal changes and clears from another app window", () => {
    const updates: (string | null)[] = [];
    const unsubscribe = subscribeToVpkScanDismissal(() => {
      updates.push(getDismissedVpkScanFingerprint());
    });
    const fingerprint = getVpkScanFingerprint(["stranger.vpk"]);
    memory.set("vpk-scan-alert.dismissed-fingerprint", fingerprint);

    window.dispatchEvent(
      Object.assign(new Event("storage"), { key: "unrelated-setting" }),
    );
    expect(updates).toEqual([]);
    window.dispatchEvent(
      Object.assign(new Event("storage"), {
        key: "vpk-scan-alert.dismissed-fingerprint",
      }),
    );
    memory.clear();
    window.dispatchEvent(Object.assign(new Event("storage"), { key: null }));

    expect(updates).toEqual([fingerprint, null]);
    unsubscribe();
  });

  it("keeps a dismissal when scan ordering changes", () => {
    dismissVpkScanAlert(getVpkScanFingerprint(["second.vpk", "first.vpk"]));

    expect(getDismissedVpkScanFingerprint()).toBe(
      getVpkScanFingerprint(["first.vpk", "second.vpk"]),
    );
  });
});
