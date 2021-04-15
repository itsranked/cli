import microtime from 'microtime';
import yargs from 'yargs';
import CommandAbstract, { CommandArgType } from '../common/command';
import Logger from '../common/logger';
import ScoreCollection from '../db/collections/score';
import Command from '../decorators/command';
import settings from '../settings.json';
import fetchText from '../utils/fetch-text';

const WebSocketClient = require('../lib/websocket/websocket-client.js');
const parseBinaryData = require('../utils/parse-binary-data.js');

async function spawnConnection(
  server: string,
  onScore: (data: any[]) => void,
  connectionResetCounter = 0,
  firstErrorTime = 0,
) {
  const client = new WebSocketClient();
  let receivedPong = false;
  let receivedLeaderboard = false;
  let pingInterval: NodeJS.Timeout;

  function restart(waitTime = 1000) {
    clearInterval(pingInterval);

    setTimeout(async () => {
      spawnConnection(server, onScore, connectionResetCounter, firstErrorTime);
    }, waitTime);
  }

  client.on('connectFailed', (err: any) => {
    switch (err.code) {
      case 'ETIMEDOUT':
        restart(1000 * 60 * 30); // 30 minutes
        break;

      case 'EHOSTUNREACH':
        restart(1000 * 60 * 60); // 1 hour
        break;

      case 'ECONNRESET':
        if (connectionResetCounter === 0) {
          firstErrorTime = microtime.now();
        }

        const timeDiff = (microtime.now() - firstErrorTime) / 1000;

        if (connectionResetCounter >= 5 && timeDiff < 1000 * 30) {
          connectionResetCounter = 0;
          firstErrorTime = 0;

          Logger.warn(`Server ${server} flagged!`);

          restart(1000 * 60 * 30); // 30 minutes
        } else {
          connectionResetCounter++;

          if (timeDiff > 1000 * 120) {
            connectionResetCounter = 0;
          }

          Logger.error(`${server} Connection failed for ${connectionResetCounter} time`, err.toString());

          restart();
        }
        break;

      default:
        Logger.error(`${server} Connection failed`, err);
        restart();
    }
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
      Logger.error(`${server} Connection error`, error);
      restart();
    });

    connection.on('close', (reason: number, ...args: unknown[]) => {
      if (reason === 1000 || reason === 1006) {
        restart();
      } else {
        Logger.error(reason, args);
        restart();
      }
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
    .filter((server) => !(settings.bannedServers as string[]).includes(server))
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
