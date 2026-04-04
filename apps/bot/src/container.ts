import { container } from "tsyringe";
import { discordClient } from "@/discord/client";
import { RedisSubscriberService } from "@/events/redis-subscriber";
import { HealthService } from "@/health/health.service";
import { TOKENS } from "@/lib/tokens";
import { ProcessManager } from "@/lib/process-manager";
import { ForumPosterService } from "@/mods/forum-poster.service";
import { ModEnricherService } from "@/mods/mod-enricher.service";
import { ReportEventPublisherService } from "@/reports/report-event-publisher.service";
import { ReportPosterService } from "@/reports/report-poster.service";

container.register(TOKENS.DiscordClient, { useValue: discordClient });

container.registerSingleton(ModEnricherService);
container.registerSingleton(ForumPosterService);
container.registerSingleton(ReportPosterService);
container.registerSingleton(ReportEventPublisherService);
container.registerSingleton(RedisSubscriberService);
container.registerSingleton(HealthService);
container.registerSingleton(ProcessManager);

export { container };
