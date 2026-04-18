export type ContinentKey = "eu" | "na" | "sa" | "apac" | "oce" | "me" | "other";

export const CONTINENT_ORDER: ContinentKey[] = [
  "eu",
  "na",
  "sa",
  "apac",
  "oce",
  "me",
  "other",
];

export const continentOf = (region: string): ContinentKey => {
  const key = region.trim().toLowerCase();
  if (
    /^(eu|de|fr|gb|uk|nl|pl|it|es|pt|se|no|fi|dk|ru|ua|tr|ch|at|be|ie)/.test(
      key,
    )
  ) {
    return "eu";
  }
  if (/^(na|us|ca|mx)/.test(key)) return "na";
  if (/^(sa|br|ar|cl)/.test(key)) return "sa";
  if (/^(ap|asia|jp|kr|cn|hk|tw|sg|in|th|vn|id|ph)/.test(key)) return "apac";
  if (/^(oc|au|nz)/.test(key)) return "oce";
  if (/^(me|ae|af|za)/.test(key)) return "me";
  return "other";
};

export const formatModeLabel = (mode: string): string =>
  mode.replace(/_/g, " ").trim();
