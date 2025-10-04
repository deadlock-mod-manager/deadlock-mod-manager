export interface BaseAnalyticsProperties {
  [key: string]: string | number | boolean | null | undefined;
}

export interface UserProperties extends BaseAnalyticsProperties {
  platform?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export interface PageViewProperties extends BaseAnalyticsProperties {
  path?: string;
  referrer?: string;
  timestamp?: string;
}

export interface DownloadProperties extends BaseAnalyticsProperties {
  platform?: string;
  version?: string;
  download_type?: "installer" | "portable" | "source";
  referrer?: string;
}

export interface FeatureProperties extends BaseAnalyticsProperties {
  feature_name?: string;
  timestamp?: string;
}

export interface ErrorProperties extends BaseAnalyticsProperties {
  error_type?: string;
  error_message?: string;
  context?: string;
  timestamp?: string;
}
