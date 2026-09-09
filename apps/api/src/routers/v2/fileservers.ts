import { FileserversResponseSchema } from "@deadlock-mods/shared";
import { publicProcedure } from "../../lib/orpc";
import { GameBananaProvider } from "../../providers/game-banana/index";

const gameBananaProvider = new GameBananaProvider();

export const fileserversRouter = {
  getGameBananaFileservers: publicProcedure
    .route({ method: "GET", path: "/v2/fileservers/gamebanana" })
    .output(FileserversResponseSchema)
    .handler(async () => {
      return await gameBananaProvider.getFileservers();
    }),
};
