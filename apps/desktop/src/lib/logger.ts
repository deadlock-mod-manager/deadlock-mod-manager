import { debug, error, info, trace, warn } from '@tauri-apps/plugin-log';
import type { ISettingsParam } from 'tslog';
import { Logger as TsLogger } from 'tslog';

interface ILogObj {}
const defaultLogObject: ILogObj = {};

export class Logger extends TsLogger<ILogObj> {
  constructor(settings?: ISettingsParam<ILogObj>) {
    super(
      {
        ...settings,
        prettyErrorLoggerNameDelimiter: ' > ',
        hideLogPositionForProduction: true
      },
      defaultLogObject
    );
  }
}

const logger = new Logger();

logger.attachTransport((logObj) => {
  const data = JSON.stringify(logObj);

  switch (logObj._meta.logLevelName) {
    case 'ERROR':
      error(data);
      break;
    case 'INFO':
      info(data);
      break;
    case 'WARN':
      warn(data);
      break;
    case 'DEBUG':
      debug(data);
      break;
    case 'TRACE':
      trace(data);
      break;
    default:
      info(data);
  }
});

export const createLogger = (name: string) => {
  return logger.getSubLogger({
    name
  });
};

export default logger;
