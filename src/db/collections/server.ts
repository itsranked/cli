import { InsertWriteOpResult } from 'mongodb';
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

  static find(): Promise<ServerType[]> {
    return new Promise(async (resolve, reject) => {
      try {
      const result = await ServerCollection.ServerCollectionInstance.find();

      resolve(result.toArray());
      } catch (ex) {
        reject(ex);
      }
    });
  }
}
