import yargs from 'yargs';
import CommandAbstract, { CommandArgType } from '../common/command';
import ScoreCollection from '../db/collections/score';
import ServerCollection, { ServerType } from '../db/collections/server';
import Command from '../decorators/command';
import saveTop100LastMonthGlobal from './json-commands/save-top100-lastMonth-global';

const WebSocketClient = require('../lib/websocket/websocket-client.js');
const parseBinaryData = require('../utils/parse-binary-data.js');

@Command('update-score', 'Updates scores')
export class UpdateScoreCommand extends CommandAbstract {
  options(_: yargs.Argv) {}

  execute(args: CommandArgType): Promise<number> {
    return new Promise(async (resolve, reject) => {
      try {
        const servers = await ServerCollection.find();

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
      await saveTop100LastMonthGlobal();

    } catch (ex) {
      console.log('writeJsonFiles', ex);
    } finally {
      resolve(null);
    }
  });
}

function startRetrievingData(servers: ServerType[], index = 0) {
  return new Promise(async (resolve, reject) => {
    if (index === servers.length) {
      await writeJsonFiles();
      index = 0;
    }

    const server = servers[index];

    console.log('retrieving data from ' + server.address);

    const client = new WebSocketClient(servers);

    client.on('connectFailed', (err: any) => {
      console.log('connectFailed', err);
      console.log('failed');

      setTimeout(async () => {
        startRetrievingData(servers, index + 1);
      }, 1000);
    });

    client.on('connect', (connection: any) => {
      connection.sendBytes(Buffer.from(new Uint8Array([0x63])));

      connection.on('error', (error: any) => {
        console.log('error', error);
        startRetrievingData(servers, index + 1);
      });

      connection.on('close', (reason: any) => {
        if (reason === 1000) {
          return new Promise(_resolve => {
            setTimeout(() => {
              _resolve(startRetrievingData(servers, index + 1));
            }, 1000);
          });
        } else {
          reject(new Error(reason));
        }
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
                console.log(ex);
              }
            }
            connection.close();
          }
        }
      });
    });

    console.log('connecting to ' + server.address);
    client.connect(`ws://${server.address}/slither`, null, 'http://slither.io', null, {});
  });
}
