import type { Client, TextChannel } from 'discord.js';
import { env } from './env';
import { logger } from './logger';
import { StatusMonitor } from './status';

export class StatusMonitorService {
  private statusMonitor: StatusMonitor;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.statusMonitor = new StatusMonitor();
  }

  async start(client: Client): Promise<void> {
    if (!env.STATUS_ENABLED) {
      logger.info('Status monitoring is disabled');
      return;
    }

    if (!env.STATUS_CHANNEL_ID) {
      logger.info('No status channel ID configured');
      return;
    }

    try {
      const channel = (await client.channels.fetch(
        env.STATUS_CHANNEL_ID
      )) as TextChannel;

      if (!channel) {
        logger.error('Status channel not found');
        return;
      }

      // Initial post/update
      await this.statusMonitor.upsertMessage(channel);

      // Set up interval
      const intervalMs = Math.max(60_000, env.STATUS_INTERVAL_MIN * 60_000); // at least 1 min
      this.intervalId = setInterval(async () => {
        try {
          await this.statusMonitor.upsertMessage(channel);
        } catch (error) {
          logger
            .withError(error)
            .error('Failed to update status message on interval');
        }
      }, intervalMs);

      logger.info(
        `Status monitoring started with ${env.STATUS_INTERVAL_MIN} minute interval`
      );
    } catch (error) {
      logger.withError(error).error('Failed to start status monitoring');
      throw error;
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Status monitoring stopped');
    }
  }
}
