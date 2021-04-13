import yargs from 'yargs';
import CommandAbstract, { CommandArgType } from '../common/command';
import Command from '../decorators/command';
import saveTop100LastMonthRegion from './json-commands/save-top100-lastMonth-region';

@Command('save-top100-last-month-region', 'Generates json data for top100 last month by region')
export class SaveTop100LastMonthRegion extends CommandAbstract {
  options(_yargs: yargs.Argv) {}

  execute(args: CommandArgType): Promise<number> {
    return new Promise(async (resolve) => {
      await saveTop100LastMonthRegion();
      resolve(0);
    });
  }
}
