import fs from 'fs';
import Logger from '../../common/logger';
import ScoreCollection, { ScoreType } from '../../db/collections/score';
import filters from './filters.json';
import getTop100Aggregation from './get-top100-aggregation';
import defaultSettings from '../../settings.json';

type FilterType = typeof filters[0];

const isProduction = fs.existsSync('/home/ubuntu');

function getFileName(prefix: string, shortName: string) {
  const path = isProduction ? '/home/ubuntu/itsranked-ui-dist/' : '';
  const fileName = `top100-${prefix}-${shortName}.json`;

  Logger.info('writing score to ' + path + fileName);

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

  if (!fs.existsSync('settings.json')) {
    fs.writeFileSync('settings.json', JSON.stringify(defaultSettings));
  }

  const settings = JSON.parse(fs.readFileSync('settings.json').toString());

  const aggregation = getTop100Aggregation({
    timestamp: { $gte: date },
    userName: { $nin: settings.bannedUsers },
    server: { $regex: filter.regex },
  });

  aggregation.splice(1, 0, {
    $match: {
      server: { $nin: settings.bannedServers },
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

  await saveTop100Hourly(filter);

  await saveTop100Daily(filter);

  await saveTop100Weekly(filter);

  await saveTop100Monthly(filter);

  await saveTop100(index + 1);
}
