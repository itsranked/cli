const util = require('util');
const connection = require('./db/connection');

async function top10LastHourCluster5(argOptions) {
    
    const dbName = 'slitherio';
    const collectionName = 'score';
    const collection = connection.db(dbName).collection(collectionName);

    const currentDate = new Date();

    const currentYear = currentDate.getUTCFullYear();
    const currentMonth = currentDate.getUTCMonth() + 1;
    const currentDateOfMonth = currentDate.getUTCDate();
    const currentHour = currentDate.getUTCHours();

    const aggregate = [
        {
            '$project': {
                _id: 0,
                'year': {
                    '$year': '$timestamp'
                }, 
                'month': {
                    '$month': '$timestamp'
                }, 
                'dayOfMonth': {
                    '$dayOfMonth': '$timestamp'
                }, 
                'hour': {
                    '$hour': '$timestamp'
                }, 
                'score': '$score', 
                'userName': { '$trim' : { 'input': '$userName'} }, 
                'server': '$server',
                'timestamp': '$timestamp'
            }
        }, {
            '$match': {
                'year': currentYear, 
                'month': currentMonth, 
                'dayOfMonth': currentDateOfMonth, 
                'hour': 1,
                server: { $regex:  /^185.50/ }
            }
        }, {
            '$group': {
                '_id': {
                    'userName': '$userName', 
                    'server': '$server'
                }, 
                'score': {
                    '$max': '$score'
                }, 
                'data': {
                    '$first': '$$ROOT'
                }
            }
        }, {
            '$sort': {
                'score': -1
            }
        }, {
            '$limit': 10
        }
    ];

    const output = await collection.aggregate(aggregate).toArray();

    return output.map(entry => ({...entry.data, score: entry.score}));
}

module.exports = top10LastHourCluster5;