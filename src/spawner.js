const connection = require('./db/connection');
const { exec } = require('child_process');

function startProcessing(servers) {

    return new Promise(resolve => {
        servers.forEach((server) => {
            const cmd = `node cli.js -l -u ${server}`;
            console.log(`$ ${cmd}`);
            exec(cmd);
        });

        resolve();
    });
}

function spawner() {
    return new Promise(async (resolve) => {
        const dbName = 'slitherio';
        const collectionName = 'server';
        const collection = connection.db(dbName).collection(collectionName);
        
        const servers = (await collection.find({}).toArray()).map((entry => entry.address));

        await startProcessing(servers);
        resolve();
    });
}

module.exports = spawner;