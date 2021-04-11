const connection = require('./src/db/connection');

const parser = require('argv-parser');

const rules = {
    leaderboard: {
        type: Boolean,
        value: false,
        short: 'l'
    },
    serverList: {
        type: Boolean,
        value: false,
        short: 's'
    },
    verbose: {
        type: Boolean,
        value: false,
        short: 'v'
    },
    spawner: {
        type: Boolean,
        value: false,
        short: 't'
    },
    url: {
        type: String,
        short: 'u',
    },
    version: {
        type: Boolean,
        value: false
    },
    top10LastHour: {
        type: Boolean,
        value: false,
    },
    top10LastHourCluster5: {
        type: Boolean,
        value: false
    },
    json: {
        type: Boolean,
        value: false,
        short: 'j'
    },
    filter: {
        type: String,
        short: 'f'
    }
}

const data = parser.parse(process.argv, { rules });

if (!data.parsed.version) {

    connection.connect(async function(err) {
        console.log('Connected successfully to server');

        try {
            if (data.parsed.leaderboard) {
                await require('./src/leaderboard')(data.parsed.url);
            } else if (data.parsed.serverList) {
                await require('./src/server-list')(data.parsed);
            } else if (data.parsed.spawner) {
                await require('./src/spawner')(data.parsed);
            } else if (data.parsed.top10LastHour) {
                const top10 = await require('./src/top10-lastHour')(data.parsed);

                top10.forEach((entry, index) => console.log(`#${index+1} ${entry.userName}@${entry.server} [${entry.score}]`))
            } else if (data.parsed.top10LastHourCluster5) {
                const top10 = await require('./src/top10-lastHour-cluster-5')(data.parsed);

                top10.forEach((entry, index) => console.log(`#${index+1} ${entry.userName}@${entry.server} [${entry.score}]`))
            } else if (data.parsed.json) {
                await require('./src/json-generator')(data.parsed);
            }

            await connection.close();
        } catch (ex) {
            console.error(ex)
        }
        process.exit(0);
    });
} else {
    console.log('itsranked!');
}