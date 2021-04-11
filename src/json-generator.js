const util = require('util');
const connection = require('./db/connection');
const fs = require('fs');
const path = require('path');

function getLastMonthFilter() {
    const output = {};

    const currentDate = new Date();

    output.year = currentDate.getUTCFullYear();
    output.month = currentDate.getUTCMonth() + 1;
    // output.dayOfMonth = currentDate.getUTCDate();
    // output.hour = currentDate.getUTCHours();

    return output;
}

function getLimit(value) {
    return {
        '$limit': value
    }
}

async function jsonGenerator(argOptions) {

    const filter = JSON.parse(argOptions.filter);

    if (!filter) {
        throw new Error('No filter provided for json generator');
    }

    return new Promise(async (resolve) => {
        const dbName = 'slitherio';
        const collectionName = 'score';
        const collection = connection.db(dbName).collection(collectionName);
        const match = {};
        const limit = {};

        if (filter.lastMonth) {
            Object.assign(match, getLastMonthFilter());
        }

        if (filter.limit) {
            Object.assign(limit, getLimit(filter.limit));
        }

        const currentDate = new Date();
        currentDate.setUTCDate(1);
        currentDate.setUTCHours(0);
        currentDate.setUTCMinutes(0);
        currentDate.setUTCSeconds(0);
        currentDate.setUTCMilliseconds(0);
    
        const aggregate = [
            {
                '$match': {
                    timestamp: {'$gte': currentDate}
                }
            }, {
                '$group': {
                    '_id': {
                        'userName': '$userName', 
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
            }, 
            limit
        ];
    
        const output = await collection.aggregate(aggregate).toArray();
        
        const jsonToSave = JSON.stringify(output.map((entry, index) => ({position: index +1, userName: entry.data.userName, timestamp: entry.data.timestamp, server: entry.data.server, score: entry.score})));

        fs.writeFileSync(`top100-month-${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth()+1).padStart(2, '0')}.json`, jsonToSave);

        resolve();

    });
}

module.exports = jsonGenerator;