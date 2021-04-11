'use strict'

const saveScores = require('./commands/saveScores');

const parseBinaryData = require('./utils/parse-binary-data');

const WebSocketClient = require('./lib/websocket-client');

// const serversList = ['185.50.104.152:444', '185.50.104.154:444', '185.50.104.155:444', '185.50.104.168:443', '185.50.104.168:444', '185.50.104.168:446', '185.50.104.169:444', '185.50.104.177:444', '185.50.104.178:443', '185.50.104.178:444'];

function connect(server) {
  return new Promise((resolve) => {
    const client = new WebSocketClient();

    client.on('connectFailed', (err) => {
      console.log('connectFailed', err);
      console.log('failed');
  
      setTimeout(async () => {
        await connect(server);
        resolve();
      }, 1000);
    });
  
    client.on('connect', (connection) => {
      console.log('connected!');
  
      connection.sendBytes(Buffer.from(new Uint8Array([0x63])));
  
      connection.on('error', (error) => {
        console.log('error', error)
      });
  
      connection.on('close', (reason) => {
        console.log('Connection closed!', reason);
      });
  
      connection.on('message', async (message) => {
        if (message.type === 'binary') {
          const parsed = parseBinaryData(connection, message.binaryData);
  
          if (parsed.command) {
            switch (parsed.command) {
              case 'SAVE_SCORES':
  
                await saveScores(server, parsed.data);

                resolve();
  
              break;
  
              default: 
            }
          }
        }
      });
  
    });
  
    console.log('Connecting to '+ server + '...');
    client.connect('ws://' + server + '/slither', null, 'http://slither.io', null, {});
  });
  
}

module.exports = connect;