import type { Logger } from '@warren/logging';
import { replaceConsoleMethods } from '../utils';

const inject = (logger: Logger) => {
  logger.debug('Injecting logger for console');
  replaceConsoleMethods(logger);
};

export default inject;
