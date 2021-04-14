import microtime from 'microtime';
import yargs from 'yargs';
import CommandAbstract, { CommandArgType } from '../common/command';
import Logger from '../common/logger';
import ScoreCollection from '../db/collections/score';
import ServerCollection, { ServerType } from '../db/collections/server';
import Command from '../decorators/command';
import saveTop100 from './json-commands/save-top100';
import bannedServers from './json-commands/banned-servers.json';

const WebSocketClient = require('../lib/websocket/websocket-client.js');
const parseBinaryData = require('../utils/parse-binary-data.js');

@Command('update-score', 'Updates scores')
export class UpdateScoreCommand extends CommandAbstract {
  options(_: yargs.Argv) {}

  execute(args: CommandArgType): Promise<number> {
    return new Promise(async (resolve, reject) => {
      try {
        const servers = await ServerCollection.find({
          address: { $nin: bannedServers },
        });

        await startRetrievingData(servers);

        resolve(0);
      } catch (ex) {
        reject(ex);
      }
    });
  }
}

function writeJsonFiles() {
  return new Promise(async (resolve) => {
    try {
      await saveTop100();
    } catch (ex) {
      Logger.error('writeJsonFiles', ex);
    } finally {
      resolve(null);
    }
  });
}

function microTimeToMinutes(microtime: number) {
  return `${microtime / 1000 / 1000 / 60}s`;
}

function startRetrievingData(servers: ServerType[], index = 0, startTime = microtime.now()) {
  return new Promise(async (resolve, reject) => {
    if (index === servers.length) {
      Logger.info('writing files...');
      await writeJsonFiles();

      Logger.info(`Benchmark: ${microTimeToMinutes(microtime.now() - startTime)} minutes`);

      startTime = microtime.now()

      index = 0;
    }

    const server = servers[index];

    const client = new WebSocketClient(servers);

    client.on('connectFailed', (err: any) => {
      Logger.error('connectFailed', err);

      setTimeout(async () => {
        startRetrievingData(servers, index + 1, startTime);
      }, 1000);
    });

    client.on('connect', (connection: any) => {
      connection.sendBytes(Buffer.from(new Uint8Array([0x63])));

      connection.on('error', (error: any) => {
        Logger.error('connection error', error);
        startRetrievingData(servers, index + 1);
      });

      connection.on('close', (reason: any) => {
        return new Promise((_resolve) => {
          setTimeout(() => {
            _resolve(startRetrievingData(servers, index + 1, startTime));
          }, 1000);
        });
      });

      connection.on('message', async (message: any) => {
        if (message.type === 'binary') {
          const parsed = parseBinaryData(connection, message.binaryData);

          if (parsed.command) {
            if (parsed.command === 'SAVE_SCORES') {
              const scoreList = parsed.data.map((entry: any) => ({
                ...entry,
                server: server.address,
                timestamp: new Date(),
              }));

              try {
                await ScoreCollection.save(scoreList);
              } catch (ex) {
                Logger.error('error saving scores', ex);
              }
            }
            connection.close();
          }
        }
      });
    });

    Logger.info(`connecting to ${server.address}`);
    client.connect(`ws://${server.address}/slither`, null, 'http://slither.io', null, {});
  });
}
