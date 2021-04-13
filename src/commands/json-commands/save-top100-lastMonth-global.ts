const fs = require('fs');
import ScoreCollection from '../../db/collections/score';
import getTop100Aggregation from './get-top100-aggregation';

export default async function saveTop100LastMonthGlobal() {
  const currentDate = new Date();
  currentDate.setUTCDate(1);
  currentDate.setUTCHours(0);
  currentDate.setUTCMinutes(0);
  currentDate.setUTCSeconds(0);
  currentDate.setUTCMilliseconds(0);

  const result = await ScoreCollection.aggregate(
    getTop100Aggregation({
      timestamp: { $gte: currentDate },
    }),
  );

  const jsonToSave = JSON.stringify(
    result.map((entry: any, index: number) => ({
      position: index + 1,
      userName: entry.data.userName,
      timestamp: entry.data.timestamp,
      server: entry.data.server,
      score: entry.score,
    })),
  );

  fs.writeFileSync(
    `top100-global-month-${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, '0')}.json`,
    jsonToSave,
  );
}
