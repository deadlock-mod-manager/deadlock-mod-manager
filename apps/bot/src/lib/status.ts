import { AttachmentBuilder, type TextChannel } from 'discord.js';
import puppeteer from 'puppeteer';
import { env } from './env';
import { logger } from './logger';

const ACCEPT_AGREE_REGEX = /accept|agree/i;

export class StatusMonitor {
  private targetMessageId: string | null = null;

  constructor() {
    this.targetMessageId = env.STATUS_MESSAGE_ID || null;
  }

  async captureStatus(): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({
        width: 1280,
        height: 800,
        deviceScaleFactor: 2,
      });
      await page.goto(env.STATUS_URL, {
        waitUntil: 'networkidle2',
        timeout: 120_000,
      });

      // Try to dismiss cookie banners if present (best-effort)
      try {
        await page.evaluate(() => {
          const buttons = Array.from(
            document.querySelectorAll('button, [role="button"]')
          );
          const cookieBtn = buttons.find((b) =>
            ACCEPT_AGREE_REGEX.test(b.textContent || '')
          );
          (cookieBtn as HTMLElement)?.click();
        });
        await page.waitForNetworkIdle({ timeout: 1000 });
      } catch {
        // Ignore cookie banner errors
      }

      // Find the main content block; fall back to full page
      const el =
        (await page.$(env.STATUS_SELECTOR)) ||
        (await page.$('main')) ||
        (await page.$('body'));
      let buffer: Buffer;

      if (el) {
        buffer = Buffer.from(await el.screenshot({ type: 'png' }));
      } else {
        buffer = Buffer.from(
          await page.screenshot({ fullPage: true, type: 'png' })
        );
      }

      return buffer;
    } finally {
      try {
        await browser.close();
      } catch (error) {
        logger.withError(error).warn('Failed to close browser');
      }
    }
  }

  async upsertMessage(channel: TextChannel): Promise<void> {
    try {
      const png = await this.captureStatus();
      const content = `**Deadlock Mod Manager — Live Status** • <${env.STATUS_URL}>\nLast update: <t:${Math.floor(Date.now() / 1000)}:R>`;
      const file = new AttachmentBuilder(png, { name: 'status.png' });

      if (this.targetMessageId) {
        try {
          const msg = await channel.messages.fetch(this.targetMessageId);
          await msg.edit({ content, files: [file] });
          logger.info('Updated status message');
          return;
        } catch (e) {
          logger
            .withError(e)
            .warn(
              'Failed to fetch/edit message by MESSAGE_ID, sending a new one...'
            );
        }
      }

      const sent = await channel.send({ content, files: [file] });
      this.targetMessageId = sent.id;
      logger.info(`Posted status message. MESSAGE_ID=${this.targetMessageId}`);

      if (env.STATUS_PIN) {
        try {
          await sent.pin();
        } catch (e) {
          logger
            .withError(e)
            .warn('Pin failed (need Manage Messages permission)');
        }
      }
    } catch (error) {
      logger.withError(error).error('Failed to update status message');
      throw error;
    }
  }
}
