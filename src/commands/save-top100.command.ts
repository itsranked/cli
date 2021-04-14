import yargs from 'yargs';
import CommandAbstract, { CommandArgType } from '../common/command';
import Command from '../decorators/command';
import settings from '../settings.json';
import saveTop100 from './json-commands/save-top100';

function keepSavingTop100() {
  return new Promise(async () => {
    await saveTop100();
    setTimeout(keepSavingTop100, 1000 * settings.intervalDuringWritesInSeconds); // 1 minute
  });
}
@Command('save-top100', 'Generates json data for top100')
export class SaveTop100Command extends CommandAbstract {
  options(_yargs: yargs.Argv) {
    _yargs.option({
      keepGoing: {
        alias: 'k',
        type: 'boolean',
        describe: 'Keeps generating top100 every minute',
        default: false,
      },
    });
  }

  execute(args: CommandArgType): Promise<number> {
    return new Promise(async (resolve) => {
      if (args.keepGoing) {
        await keepSavingTop100();
      } else {
        await saveTop100();
        resolve(0);
      }
    });
  }
}
