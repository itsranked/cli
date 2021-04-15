import { AggregationCursor, CollectionAggregationOptions, CollectionInsertManyOptions, Cursor, FilterQuery } from 'mongodb';
import Logger from '../common/logger';
import client from '../db';

export default class Collection<T> {
  constructor(private database: string = '', private collection: string = '') {}

  async makeSureItsconnected() {
    if (!client.isConnected()) {
      Logger.info('Connecting to ' + this.database + '/' + this.collection );
      await client.connect();
      Logger.info('connected!');
    }
  }

  async insertMany(
    docs: any[],
    options: CollectionInsertManyOptions = {
      ordered: false,
      wtimeout: 2000,
      writeConcern: { w: 0, j: false },
    } as any,
  ) {
    await this.makeSureItsconnected();

    return client
      .db(this.database)
      .collection(this.collection)
      .insertMany(docs, options);
  }

  async find(query?: FilterQuery<T>): Promise<Cursor<T>> {
    await this.makeSureItsconnected();

    return client
      .db(this.database)
      .collection(this.collection)
      .find(query);
  }

  async aggregate(pipeline: object[], options?: CollectionAggregationOptions): Promise<AggregationCursor<T>> {
    await this.makeSureItsconnected();

    return client
      .db(this.database)
      .collection(this.collection)
      .aggregate(pipeline, options);
  }
}
