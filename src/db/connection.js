const assert = require('assert');
const MongoClient = require('mongodb').MongoClient;

const url = 'mongodb+srv://mongodb:OCB5zpBV3sXK9qNo@itsrankeddb.zdnrm.mongodb.net';

const client = new MongoClient(url,  { useUnifiedTopology: true, useNewUrlParser: true, useUnifiedTopology: true } );

module.exports = client;