import yargs from 'yargs';
import CommandAbstract, { CommandArgType } from '../common/command';
import Logger from '../common/logger';
import Command from '../decorators/command';
import defaultSettings from '../settings.json';
import getObjectDiff from '../utils/get-object-diff';
import getSettings from '../utils/get-settings';
import saveTop100 from './json-commands/save-top100';

type SettingsType = typeof defaultSettings;

let currentSettings: SettingsType;

function keepSavingTop100() {
  const settings = getSettings();

  const diff = getObjectDiff(settings, currentSettings);

  if (Object.keys(diff).length > 0) {
    Logger.info('New settings found');
    Logger.info(diff);

    currentSettings = settings;
  }

  return new Promise(async () => {
    await saveTop100(settings);
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
        const settings = getSettings();

        await saveTop100(settings);
      }
      resolve(0);
    });
  }
}
