import yargs from 'yargs';
import CommandAbstract, { CommandArgType } from '../common/command';
import Logger from '../common/logger';
import ServerCollection from '../db/collections/server';
import Command from '../decorators/command';
import fetchText from '../utils/fetch-text';

@Command('update-server-list [url]', 'Updates server list')
export class UpdateServerListCommand extends CommandAbstract {
  options(_yargs: yargs.Argv) {
    _yargs.options({
      url: {
        alias: 'u',
        describe: 'define url for server addresses',
        default: 'http://slither.io/i33628.txt',
      },
    });
  }

  execute(args: CommandArgType): Promise<number> {
    return new Promise(async (resolve, reject) => {
      try {
        const url = new URL(String(args.url));

        const response = await fetchText(url);

        const serverList = require('../utils/parseServerString')(response) as string[];

        Logger.info(`Updating server list with ${serverList.length} items...`);

        await ServerCollection.save(serverList.map(server => ({ address: server })));

        Logger.info('Server list updated!');

        resolve(0);
      } catch (ex) {
        reject(ex);
      }
    });
  }
}
