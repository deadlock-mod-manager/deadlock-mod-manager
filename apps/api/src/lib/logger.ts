import type { ILogObj, ISettingsParam } from 'tslog';
import { Logger as TsLogger } from 'tslog';

export class Logger extends TsLogger<ILogObj> {
  constructor(settings?: ISettingsParam<ILogObj>) {
    super({
      ...settings,
      prettyErrorLoggerNameDelimiter: ' > ',
      hideLogPositionForProduction: true,
    });
  }
}

const logger = new Logger();

export default logger;
