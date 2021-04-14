import fs from 'fs';
import Logger from '../../common/logger';
import ScoreCollection, { ScoreType } from '../../db/collections/score';
import bannedServers from './banned-servers.json';
import bannedUsers from './banned-users.json';
import filters from './filters.json';
import getTop100Aggregation from './get-top100-aggregation';

type FilterType = typeof filters[0];

const isProduction = fs.existsSync('/home/ubuntu/website/build');

function getFileName(prefix: string, shortName: string) {
  const path = isProduction ? '/home/ubuntu/website/build/' : '';
  const fileName = `top100-${prefix}-${shortName}.json`;

  return path + fileName;
}

function getJson(scores: ScoreType[]) {
  return JSON.stringify(
    scores.map((entry: any, index: number) => ({
      position: index + 1,
      ...entry,
    })),
  );
}

async function getTop100ByDateAndFilter(date: Date, filter: FilterType) {
  const aggregation = getTop100Aggregation({
    timestamp: { $gte: date },
    userName: { $nin: bannedUsers },
    server: { $regex: filter.regex },
  });

  aggregation.splice(1, 0, {
    $match: {
      server: { $nin: bannedServers },
    },
  });

  return await ScoreCollection.aggregate(aggregation);
}

async function saveTop100Monthly(filter: FilterType) {
  const currentDate = new Date();
  currentDate.setUTCDate(1);
  currentDate.setUTCHours(0);
  currentDate.setUTCMinutes(0);
  currentDate.setUTCSeconds(0);
  currentDate.setUTCMilliseconds(0);

  const result = await getTop100ByDateAndFilter(currentDate, filter);

  const fileName = getFileName('monthly', filter.shortName);

  fs.writeFileSync(fileName, getJson(result));
}

async function saveTop100Weekly(filter: FilterType) {
  const currentDate = new Date();

  currentDate.setUTCDate(currentDate.getUTCDate() - currentDate.getUTCDay());
  currentDate.setUTCHours(0);
  currentDate.setUTCMinutes(0);
  currentDate.setUTCSeconds(0);
  currentDate.setUTCMilliseconds(0);

  const result = await getTop100ByDateAndFilter(currentDate, filter);

  const fileName = getFileName('weekly', filter.shortName);

  fs.writeFileSync(fileName, getJson(result));
}

async function saveTop100Daily(filter: FilterType) {
  const currentDate = new Date();
  currentDate.setUTCHours(0);
  currentDate.setUTCMinutes(0);
  currentDate.setUTCSeconds(0);
  currentDate.setUTCMilliseconds(0);

  const result = await getTop100ByDateAndFilter(currentDate, filter);

  const fileName = getFileName('daily', filter.shortName);

  fs.writeFileSync(fileName, getJson(result));
}

async function saveTop100Hourly(filter: FilterType) {
  const currentDate = new Date();
  currentDate.setUTCMinutes(0);
  currentDate.setUTCSeconds(0);
  currentDate.setUTCMilliseconds(0);

  const result = await getTop100ByDateAndFilter(currentDate, filter);

  const fileName = getFileName('hourly', filter.shortName);

  fs.writeFileSync(fileName, getJson(result));
}

export default async function saveTop100(index = 0) {
  if (index === filters.length) {
    return Promise.resolve();
  }

  const filter = filters[index];

  Logger.info(`Writing hourly file for ${filter.shortName}`);

  await saveTop100Hourly(filter);

  Logger.info(`Writing daily file for ${filter.shortName}`);

  await saveTop100Daily(filter);

  Logger.info(`Writing weekly file for ${filter.shortName}`);

  await saveTop100Weekly(filter);

  Logger.info(`Writing monthly file for ${filter.shortName}`);

  await saveTop100Monthly(filter);

  await saveTop100(index + 1);
}
