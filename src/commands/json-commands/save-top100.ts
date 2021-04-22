import fs from 'fs';
import Logger from '../../common/logger';
import ScoreCollection, { ScoreType } from '../../db/collections/score';
import defaultSettings from '../../settings.json';
import getFileName from '../../utils/get-filename';
import filters from './filters.json';
import getTop100Aggregation from './get-top100-aggregation';

type FilterType = typeof filters[0];
type SettingsType = typeof defaultSettings;

function getScoresWithPosition(scores: ScoreType[]) {
  return JSON.stringify(
    scores.map((entry: any, index: number) => ({
      position: index + 1,
      ...entry,
    })),
  );
}

function writeScores(file: string, scores: ScoreType[]) {
  Logger.info(`writing ${scores.length} scores to ${file}`);

  fs.writeFileSync(file, getScoresWithPosition(scores));
}

async function getTop100ByDateAndFilter(settings: SettingsType, date: Date, filter: FilterType) {
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

async function saveTop100Weekly(settings: SettingsType, filter: FilterType) {
  const currentDate = new Date();

  currentDate.setUTCDate(currentDate.getUTCDate() - currentDate.getUTCDay());
  currentDate.setUTCHours(0);
  currentDate.setUTCMinutes(0);
  currentDate.setUTCSeconds(0);
  currentDate.setUTCMilliseconds(0);

  const result = await getTop100ByDateAndFilter(settings, currentDate, filter);

  const fileName = getFileName(settings.outputDir, 'weekly', filter.shortName);

  writeScores(fileName, result);
}

async function saveTop100Daily(settings: SettingsType, filter: FilterType) {
  const currentDate = new Date();
  currentDate.setUTCHours(0);
  currentDate.setUTCMinutes(0);
  currentDate.setUTCSeconds(0);
  currentDate.setUTCMilliseconds(0);

  const result = await getTop100ByDateAndFilter(settings, currentDate, filter);

  const fileName = getFileName(settings.outputDir, 'daily', filter.shortName);

  writeScores(fileName, result);
}

async function saveTop100Hourly(settings: SettingsType, filter: FilterType) {
  const currentDate = new Date();
  currentDate.setUTCMinutes(0);
  currentDate.setUTCSeconds(0);
  currentDate.setUTCMilliseconds(0);

  const result = await getTop100ByDateAndFilter(settings, currentDate, filter);

  const fileName = getFileName(settings.outputDir, 'hourly', filter.shortName);

  writeScores(fileName, result);
}

export default async function saveTop100(settings: SettingsType, index: number = 0) {
  if (index === filters.length) {
    return Promise.resolve();
  }

  const filter = filters[index];

  await saveTop100Hourly(settings, filter);

  await saveTop100Daily(settings, filter);

  await saveTop100Weekly(settings, filter);

  await saveTop100(settings, index + 1);
}
