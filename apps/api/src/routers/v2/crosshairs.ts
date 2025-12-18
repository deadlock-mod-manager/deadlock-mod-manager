import { CrosshairRepository, db, eq, user } from "@deadlock-mods/database";
import {
  CreateCrosshairSchema,
  CrosshairDtoSchema,
  CrosshairIdParamSchema,
  CrosshairLikesResponseSchema,
  CrosshairsListResponseSchema,
  toCrosshairDto,
} from "@deadlock-mods/shared";
import { ORPCError } from "@orpc/server";
import { protectedProcedure, publicProcedure } from "../../lib/orpc";

const crosshairRepository = new CrosshairRepository(db);

export const crosshairsRouter = {
  listCrosshairs: publicProcedure
    .route({ method: "GET", path: "/v2/crosshairs" })
    .output(CrosshairsListResponseSchema)
    .handler(async () => {
      const allCrosshairs = await crosshairRepository.findAll();
      return allCrosshairs.map(toCrosshairDto);
    }),

  getCrosshair: publicProcedure
    .route({ method: "GET", path: "/v2/crosshairs/{id}" })
    .input(CrosshairIdParamSchema)
    .output(CrosshairDtoSchema)
    .handler(async ({ input, context }) => {
      const crosshair = await crosshairRepository.findById(input.id);
      if (!crosshair) {
        throw new ORPCError("NOT_FOUND");
      }

      const userData = await db
        .select({
          name: user.name,
          image: user.image,
        })
        .from(user)
        .where(eq(user.id, crosshair.userId))
        .limit(1);

      const userId = context.session?.user?.id;
      const hasLiked = userId
        ? await crosshairRepository.hasLiked(crosshair.id, userId)
        : false;

      return toCrosshairDto({
        ...crosshair,
        user: userData[0] ?? null,
        hasLiked,
      });
    }),

  publishCrosshair: protectedProcedure
    .route({ method: "POST", path: "/v2/crosshairs" })
    .input(CreateCrosshairSchema)
    .output(CrosshairDtoSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session?.user?.id;
      if (!userId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const crosshair = await crosshairRepository.create({
        userId,
        name: input.name,
        description: input.description,
        config: input.config,
        tags: input.tags,
        heroes: input.heroes,
        likes: 0,
        downloads: 0,
      });

      const userData = await db
        .select({
          name: user.name,
          image: user.image,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

      return toCrosshairDto({
        ...crosshair,
        user: userData[0] ?? null,
        hasLiked: false,
      });
    }),

  incrementDownload: publicProcedure
    .route({ method: "POST", path: "/v2/crosshairs/{id}/download" })
    .input(CrosshairIdParamSchema)
    .output(CrosshairDtoSchema)
    .handler(async ({ input, context }) => {
      const crosshair = await crosshairRepository.incrementDownloads(input.id);
      if (!crosshair) {
        throw new ORPCError("NOT_FOUND");
      }

      const userData = await db
        .select({
          name: user.name,
          image: user.image,
        })
        .from(user)
        .where(eq(user.id, crosshair.userId))
        .limit(1);

      const userId = context.session?.user?.id;
      const hasLiked = userId
        ? await crosshairRepository.hasLiked(crosshair.id, userId)
        : false;

      return toCrosshairDto({
        ...crosshair,
        user: userData[0] ?? null,
        hasLiked,
      });
    }),

  toggleLike: protectedProcedure
    .route({ method: "POST", path: "/v2/crosshairs/{id}/like" })
    .input(CrosshairIdParamSchema)
    .output(CrosshairLikesResponseSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session?.user?.id;
      if (!userId) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const hasLiked = await crosshairRepository.toggleLike(input.id, userId);
      const likes = await crosshairRepository.getLikes(input.id);

      return {
        likes,
        hasLiked,
      };
    }),

  getLikes: publicProcedure
    .route({ method: "GET", path: "/v2/crosshairs/{id}/likes" })
    .input(CrosshairIdParamSchema)
    .output(CrosshairLikesResponseSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session?.user?.id;
      const hasLiked = userId
        ? await crosshairRepository.hasLiked(input.id, userId)
        : false;
      const likes = await crosshairRepository.getLikes(input.id);

      return {
        likes,
        hasLiked,
      };
    }),
};
