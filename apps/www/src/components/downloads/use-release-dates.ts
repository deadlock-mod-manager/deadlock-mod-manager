import { useTranslation } from "react-i18next";
import { getLocaleConfig } from "@/lib/i18n/locales";
import { useLocale } from "@/lib/i18n/route";

export const useReleaseDates = () => {
  const { t } = useTranslation("download");
  const { hreflang } = getLocaleConfig(useLocale());
  const dateFormat = new Intl.DateTimeFormat(hreflang, {
    dateStyle: "long",
    timeZone: "UTC",
  });

  const formatDate = (iso: string): string => dateFormat.format(new Date(iso));

  const formatDateTime = (iso: string): string => {
    const date = new Date(iso);
    const time = [date.getUTCHours(), date.getUTCMinutes()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
    return t("releaseDate.dateTime", { date: formatDate(iso), time });
  };

  return { formatDate, formatDateTime };
};
