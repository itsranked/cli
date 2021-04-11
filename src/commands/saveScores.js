const connection = require('../db/connection');

function saveScores(server, scores) {
    return new Promise(async (resolve) => {
        const dbName = 'slitherio';
        const collectionName = 'score';
            
        const collection = connection.db(dbName).collection(collectionName);

        await collection.insertMany(scores.map(({userName, score}) => {
            return {
                server, 
                userName,
                score,
                timestamp: new Date()
            }
        }));

        resolve();
    });    
}

module.exports = saveScores;