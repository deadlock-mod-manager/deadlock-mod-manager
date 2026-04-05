import {
  BaseError,
  RuntimeError,
  UnknownError,
  ValidationError,
} from "@deadlock-mods/common";
import type { FileserverGeo } from "@deadlock-mods/shared";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import { CACHE_TTL } from "../lib/constants";
import { cache } from "../lib/redis";
import { env } from "@/lib/env";

const NslookupGeoResponseSchema = z.object({
  queryResult: z.object({
    response: z.object({
      answer: z.array(
        z.object({
          ipInfo: z
            .object({
              country: z.string().optional(),
              city: z.string().optional(),
            })
            .optional(),
        }),
      ),
    }),
  }),
});

const fetchGeoFromNslookup = async (
  domain: string,
): Promise<Result<FileserverGeo, BaseError>> => {
  const url = new URL("https://www.nslookup.io/api/v1/records/other");
  url.searchParams.set("domain", domain);
  url.searchParams.set("type", "A");
  url.searchParams.set("server", "cloudflare");

  const response = await fetch(url);
  if (!response.ok) {
    return err(new RuntimeError(`nslookup.io HTTP ${response.status}`));
  }

  const parsed = NslookupGeoResponseSchema.safeParse(await response.json());

  if (!parsed.success) {
    return err(
      new ValidationError("Invalid nslookup.io response", parsed.error),
    );
  }
  const firstAnswer = parsed.data.queryResult.response.answer[0];
  if (!firstAnswer) {
    return err(new RuntimeError("DNS lookup returned no A records"));
  }
  const country = firstAnswer.ipInfo?.country?.trim();
  if (!country) {
    return err(new RuntimeError("Geo lookup returned no country"));
  }
  const city = firstAnswer.ipInfo?.city?.trim() ?? "";
  return ok({ country, city });
};

export const resolveFileserverGeo = async (
  domain: string,
): Promise<Result<FileserverGeo, BaseError>> => {
  const ttl = env.NODE_ENV === "development" ? 0 : CACHE_TTL.FILESERVER_GEO;
  return cache
    .wrap(
      `fileservers:geo:${domain.toLowerCase()}`,
      async () => {
        const geoResult = await fetchGeoFromNslookup(domain);
        if (geoResult.isErr()) {
          throw geoResult.error;
        }
        return geoResult.value;
      },
      ttl,
    )
    .then(
      (value) => ok(value),
      (error) => {
        if (error instanceof BaseError) {
          return err(error);
        }
        if (error instanceof Error) {
          return err(new RuntimeError(error.message, error));
        }
        return err(new UnknownError(error));
      },
    );
};
