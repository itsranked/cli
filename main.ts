import microtime from 'microtime';
import 'source-map-support/register';
import yargs from 'yargs';
import CliOptions from './src/cli-options';
import Logger from './src/common/logger';

function microtimeToSeconds(microtime: number) {
  return `${microtime/1000/1000}s`;
}

async function Main(argv: string[]): Promise<number> {
  return new Promise(async (resolve, reject) => {
    try {
      const exitCode = await CliOptions(argv);
      resolve(exitCode);
    } catch (ex) {
      reject(ex);
    }
  });
}

(async () => {
  try {
    const startTime = microtime.now();

    const execute = await Main(process.argv);

    if (yargs.parsed && yargs.parsed.argv.verbose) {
      Logger.info(`Benchmark: ${microtimeToSeconds(microtime.now() - startTime)}`);
    }

    process.exit(execute);
  } catch (ex) {
    if (ex instanceof Error) {
      console.error(ex.stack);
    } else {
      console.error(`[ERROR] ${ex}`);
    }
  }
})();

export default Main;
