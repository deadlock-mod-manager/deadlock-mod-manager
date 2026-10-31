import { create } from "zustand";
import type { SessionReport } from "./types";

export const useRecentCrashReport = create<{ report: SessionReport | null }>(
  () => ({ report: null }),
);

export function setRecentCrashReport(report: SessionReport | null) {
  useRecentCrashReport.setState({ report });
}
