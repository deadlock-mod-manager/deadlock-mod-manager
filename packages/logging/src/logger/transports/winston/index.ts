import { WinstonTransport } from '@loglayer/transport-winston';
import winston from 'winston';
import { prodFormat } from './formats/json';
import { devFormat } from './formats/log-fmt';

export const createWinstonTransport = (
  options?: Partial<winston.LoggerOptions>
) => {
  const isDevelopment = process.env?.NODE_ENV === 'development';

  const logger = winston.createLogger({
    level: process.env?.LOG_LEVEL ?? 'info',
    format: isDevelopment ? devFormat : prodFormat,
    transports: [new winston.transports.Console()],
    ...options,
  });

  const transport = new WinstonTransport({
    logger,
  });

  return {
    transport,
    logger,
  };
};

export type WinstonTransportOptions = Parameters<
  typeof createWinstonTransport
>[number];
