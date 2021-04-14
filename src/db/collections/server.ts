import { FilterQuery, InsertWriteOpResult } from 'mongodb';
import Collection from '../collection';

export type ServerType = {
  address: string;
};

export default class ServerCollection {
  private static ServerCollectionInstance = new Collection<ServerType>('slitherio', 'server');

  static save(servers: ServerType[]) {
    return new Promise<InsertWriteOpResult<any>>(async (resolve, reject) => {
      try {
        const result = await ServerCollection.ServerCollectionInstance.insertMany(servers);

        resolve(result);
      } catch (ex) {
        reject(ex);
      }
    });
  }

  static find(query?: FilterQuery<ServerType>): Promise<ServerType[]> {
    return new Promise(async (resolve, reject) => {
      try {
      const result = await ServerCollection.ServerCollectionInstance.find(query);

      resolve(result.toArray());
      } catch (ex) {
        reject(ex);
      }
    });
  }
}
