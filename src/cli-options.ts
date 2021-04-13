import yargs from 'yargs';
import { UpdateScoreCommand } from './commands/update-score.command';
import { UpdateServerListCommand } from './commands/update-server-list.command';
import { CommandRegistry } from './common/registry';
import client from './db';

function CliOptions(options: string[]): Promise<number> {
  return new Promise(async (resolve, reject) => {
    try {
      const yargsInstance = yargs(options.slice(2))
        .scriptName('>')
        .usage('Usage: $0 <command> [options]')
        .help('h')
        .alias('h', 'help')

        .option('verbose', {
          alias: 'v',
          type: 'boolean',
          description: 'Run with verbose logging',
        })
        .onFinishCommand(async () => {
          if (client.isConnected()) {
            await client.close();
          }

          resolve(0);
        })
        .strictCommands()
        .demandCommand(1)
        .wrap(null)
        .epilog('developed by https://github.com/rafaelfontes 2021');

      CommandRegistry.getInstance().addCommand(new UpdateServerListCommand(yargsInstance));
      CommandRegistry.getInstance().addCommand(new UpdateScoreCommand(yargsInstance));

      yargsInstance.parse();
    } catch (ex) {
      if (client.isConnected()) {
        await client.close();
      }

      reject(ex);
    }
  });
}

export default CliOptions;
