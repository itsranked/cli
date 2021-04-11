const connection = require('../db/connection');

function saveServers(servers) {
    return new Promise(async (resolve) => {
        const dbName = 'slitherio';
        const collectionName = 'server';
            
        const collection = connection.db(dbName).collection(collectionName);

        await collection.insertMany(servers.map(server => ({address: server})), { writeConcern: {w: 0}, ordered: false });

        resolve();
    });    
}

module.exports = saveServers;