import yargs from 'yargs';
import CommandAbstract, { CommandArgType } from '../common/command';
import Command from '../decorators/command';
import saveTop100LastMonthGlobal from './json-commands/save-top100-lastMonth-global';

@Command('save-top100-last-month', 'Generates json data for top100 last month')
export class SaveTop100LastMonth extends CommandAbstract {
  options(_yargs: yargs.Argv) {}

  execute(args: CommandArgType): Promise<number> {
    return new Promise(async (resolve) => {
      await saveTop100LastMonthGlobal();
      resolve(0);
    });
  }
}
