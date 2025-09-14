const CRON_REGEX_6_FIELD =
  /^(\*|([0-5]?\d)) (\*|([0-5]?\d)) (\*|(1?\d|2[0-3])) (\*|([1-2]?\d|3[01])) (\*|(0?\d|1[0-2])) (\*|[0-7])$/;
const CRON_REGEX_5_FIELD =
  /^(\*|([0-5]?\d)) (\*|(1?\d|2[0-3])) (\*|([1-2]?\d|3[01])) (\*|(0?\d|1[0-2])) (\*|[0-7])$/;

export function validateCronPattern(pattern: string): boolean {
  return CRON_REGEX_6_FIELD.test(pattern) || CRON_REGEX_5_FIELD.test(pattern);
}

export const CronPatterns = {
  EVERY_MINUTE: '0 * * * * *',
  EVERY_5_MINUTES: '0 */5 * * * *',
  EVERY_10_MINUTES: '0 */10 * * * *',
  EVERY_15_MINUTES: '0 */15 * * * *',
  EVERY_30_MINUTES: '0 */30 * * * *',
  EVERY_HOUR: '0 0 * * * *',
  EVERY_2_HOURS: '0 0 */2 * * *',
  EVERY_6_HOURS: '0 0 */6 * * *',
  EVERY_12_HOURS: '0 0 */12 * * *',
  DAILY: '0 0 0 * * *',
  DAILY_NOON: '0 0 12 * * *',
  WEEKLY: '0 0 0 * * 0',
  MONTHLY: '0 0 0 1 * *',
  YEARLY: '0 0 0 1 1 *',
  BUSINESS_HOURS_HOURLY: '0 0 9-17 * * 1-5',
  BUSINESS_HOURS_15MIN: '0 */15 9-17 * * 1-5',
  MAINTENANCE_DAILY: '0 0 2 * * *',
  MAINTENANCE_WEEKLY: '0 0 3 * * 0',
} as const;

export const Intervals = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;
