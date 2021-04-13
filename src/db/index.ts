import { MongoClient } from 'mongodb';

const url = 'mongodb+srv://mongodb:OCB5zpBV3sXK9qNo@itsrankeddb.zdnrm.mongodb.net';

const client = new MongoClient(url, { useUnifiedTopology: true, useNewUrlParser: true });

export default client;
