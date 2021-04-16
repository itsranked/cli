import { InsertWriteOpResult } from 'mongodb';
import Collection from '../collection';

export type ScoreType = {
  server: string;
  userName: string;
  score: number;
  timestamp: Date;
};

export default class ScoreCollection {
  private static ScoreCollectionInstance = new Collection<ScoreType>('slitherio', 'score');

  static connectIfNotConnected() {
    return ScoreCollection.ScoreCollectionInstance.makeSureItsConnected();
  }

  static save(scoreList: ScoreType[]) {
    return new Promise<InsertWriteOpResult<any>>(async (resolve, reject) => {
      try {
        const result = await ScoreCollection.ScoreCollectionInstance.insertMany(scoreList);

        resolve(result);
      } catch (ex) {
        reject(ex);
      }
    });
  }

  static aggregate(pipeline: object[]) {
    return new Promise<ScoreType[]>(async (resolve, reject) => {
      try {
        const result = await ScoreCollection.ScoreCollectionInstance.aggregate(pipeline);

        resolve(result.toArray());
      } catch (ex) {
        reject(ex);
      }
    });
  }
}
