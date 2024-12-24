import { prisma } from "./client";

(async () => {
  try {

    await prisma.customSetting.create({
      data: {
        key: "citadel_unit_status_use_new",
        value: "true",
        type: "launch_option", // TODO: enum
        description: "Use new unit status system (new healthbar, etc.)",
      },
    });

  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
