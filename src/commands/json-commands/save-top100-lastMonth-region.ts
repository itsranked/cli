import fs from 'fs';
import ScoreCollection from '../../db/collections/score';
import getTop100Aggregation from './get-top100-aggregation';
import util from 'util';
import bannedServers from './banned-servers.json';
import bannedUsers from './banned-users.json';
import regions from './regions.json';

export default async function saveTop100LastMonthRegion(index = 0) {
  const currentDate = new Date();
  currentDate.setUTCDate(1);
  currentDate.setUTCHours(0);
  currentDate.setUTCMinutes(0);
  currentDate.setUTCSeconds(0);
  currentDate.setUTCMilliseconds(0);

  if (index === regions.length) {
    return;
  }

  const aggregation = getTop100Aggregation({
    timestamp: { $gte: currentDate },
    userName: { $nin: bannedUsers },
    server: { $regex: '^' + regions[index].startAddress.join('|^') },
  });

  aggregation.splice(1, 0, {
    $match: {
      server: { $nin: bannedServers },
    },
  });

  const result = await ScoreCollection.aggregate(aggregation);

  const jsonToSave = JSON.stringify(
    result.map((entry: any, index: number) => ({
      position: index + 1,
      ...entry,
    })),
  );

  if (fs.existsSync('/home/ubuntu/website/build')) {
    fs.writeFileSync(
      `/home/ubuntu/website/build/top100-global-month-${currentDate.getUTCFullYear()}-${String(
        currentDate.getUTCMonth() + 1,
      ).padStart(2, '0')}-${regions[index].alias}.json`,
      jsonToSave,
    );
  } else {
    fs.writeFileSync(
      `top100-global-month-${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(
        2,
        '0',
      )}-${regions[index].alias}.json`,
      jsonToSave,
    );
  }


  await saveTop100LastMonthRegion(index + 1);
}
