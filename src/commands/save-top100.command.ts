import yargs from 'yargs';
import CommandAbstract, { CommandArgType } from '../common/command';
import Command from '../decorators/command';
import saveTop100 from './json-commands/save-top100';

@Command('save-top100', 'Generates json data for top100')
export class SaveTop100Command extends CommandAbstract {
  options(_yargs: yargs.Argv) {}

  execute(args: CommandArgType): Promise<number> {
    return new Promise(async (resolve) => {
      await saveTop100();
      resolve(0);
    });
  }
}
