import microtime from 'microtime';
import yargs from 'yargs';
import CommandAbstract, { CommandArgType } from '../common/command';
import Logger from '../common/logger';
import ScoreCollection from '../db/collections/score';
import { ServerType } from '../db/collections/server';
import Command from '../decorators/command';
import settings from '../settings.json';
import fetchText from '../utils/fetch-text';
import saveTop100 from './json-commands/save-top100';

const WebSocketClient = require('../lib/websocket/websocket-client.js');
const parseBinaryData = require('../utils/parse-binary-data.js');

async function spawnConnection(server: string, onScore: (data: any[]) => void) {
  const client = new WebSocketClient();
  let receivedPong = false;
  let receivedLeaderboard = false;

  let pingInterval: NodeJS.Timeout;

  function restart() {
    setTimeout(async () => {
      clearInterval(pingInterval);
      spawnConnection(server, onScore);
    }, 1000);
  }

  client.on('connectFailed', (err: any) => {
    Logger.error('connectFailed', err);
    restart();
  });

  client.on('connect', (connection: any) => {
    pingInterval = setInterval(() => {
      if (receivedPong) {
        if (connection.connected) {
          connection.sendBytes(Buffer.from(new Uint8Array([0xfb]))); // PING command
        }

        receivedPong = false;
      }
      connection.send;
    }, 250);

    connection.sendBytes(Buffer.from(new Uint8Array([0x63]))); // Start handshake

    connection.on('error', (error: any) => {
      Logger.error('connection error', error);
      restart();
    });

    connection.on('close', () => {
      restart();
    });

    connection.on('message', async (message: any) => {
      if (message.type === 'binary') {
        const parsed = parseBinaryData(connection, message.binaryData);

        if (parsed.command) {
          if (parsed.command === 'SAVE_SCORES') {
            const scoreList = parsed.data.map((entry: any) => ({ ...entry, server, timestamp: new Date() }));

            if (!receivedLeaderboard) {
              connection.sendBytes(Buffer.from(new Uint8Array([0xfb]))); // PING command
              receivedLeaderboard = true;
            }

            onScore(scoreList);
          }

          if (parsed.command === 'DEAD') {
            connection.close();
          }

          if (parsed.command === 'PONG') {
            receivedPong = true;
          }
        }
      }
    });
  });

  client.connect(`ws://${server}/slither`, null, 'http://slither.io', null, {});
}

function waitForTop10AndStoreIt(servers: string[]) {
  const scores = [] as any[];

  servers
    .filter((server) => !settings.bannedServers.includes(server))
    .forEach((server) => {
      spawnConnection(server, (data: any[]) => {
        const totalScore = data.reduce((result, entry) => result + entry.score, 0);
        const avgScore = totalScore / data.length;

        if (avgScore >= settings.minimumScoreToRank) {
          scores.push.apply(scores, data);
        }
      });
    });

  async function saveScores() {
    const dataToSave = [] as any[];

    if (scores.length > 0) {
      while (scores.length > 0) {
        const entry = scores.shift();
        if (entry.userName.trim() !== '' && entry.score > settings.minimumScoreToRank) {
          dataToSave.push(entry);
        }
      }

      if (dataToSave.length > 0) {
        Logger.info(`Saving ${dataToSave.length} scores`);

        await ScoreCollection.save(dataToSave);
      }
    }

    setTimeout(() => {
      saveScores();
    }, 1000);
  }

  setTimeout(() => {
    saveScores();
  }, 1000);
}

@Command('update-score', 'Updates scores')
export class UpdateScoreCommand extends CommandAbstract {
  options(_: yargs.Argv) {}

  execute(args: CommandArgType): Promise<number> {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetchText(new URL('http://slither.io/i33628.txt'));

        const servers = require('../utils/parseServerString')(response) as string[];

        waitForTop10AndStoreIt(servers); // loops indefinitely
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

      startTime = microtime.now();

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
