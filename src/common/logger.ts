import moment from 'moment';
import yargs from 'yargs';

export default class Logger {
  static LOGGER = console.log;

  static log(...args: unknown[]) {
    Logger.LOGGER.apply(null, args);
  }

  static warn(...args: any[]) {
    if (yargs.parsed) {
      const params = [`[${moment().format('MM/DD/YY H:mm:ss')}] [WARN]`].concat(args);
      Logger.LOGGER.apply(null, params);
    }
  }

  static info(...args: any[]) {
    if (yargs.parsed) {
      if (yargs.parsed.argv.verbose) {
        const params = [`[${moment().format('MM/DD/YY H:mm:ss')}] [INFO]`].concat(args);
        Logger.LOGGER.apply(null, params);
      }
    }
  }

  static error(...args: any[]) {
    if (yargs.parsed) {
      const params = [`[${moment().format('MM/DD/YY H:mm:ss')}] [ERROR]`].concat(args);
      Logger.LOGGER.apply(null, params);
    }
  }
}
