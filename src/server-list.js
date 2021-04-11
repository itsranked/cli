const util = require('util')
const http = require('http');
const listAddress = 'http://slither.io/i33628.txt';
const servers = require('./servers.json');
const saveServers = require('./commands/saveServers');
const { resolve } = require('path');

function parseServerString(b) {
    const sos = [];
    const clus = [];
    b.charAt(0);
    let c = 1,
        e = {},
        h = 0;
    e = h = 0;
    for (let w, f = 0, q = 0, x = [], G = [], A = [], H = []; c < b.length;)
        if (w = (b.charCodeAt(c++) - 97 - q) % 26,
        0 > w && (w += 26),
        f *= 16,
        f += w,
        q += 7,
        1 == e) {
        if (0 == h)
            x.push(f),
            4 == x.length && h++;
        else if (1 == h)
            G.push(f),
            3 == G.length && h++;
        else if (2 == h)
            A.push(f),
            3 == A.length && h++;
        else if (3 == h && (H.push(f),
            1 == H.length)) {
            e = {};
            for (h = w = 0; h < G.length; h++)
            w *= 256,
            w += G[h];
            for (h = G = 0; h < A.length; h++)
            G *= 256,
            G += A[h];
            e.ip = x.join(".");
            e.po = w;
            e.ac = G;
            e.wg = G + 5;
            e.clu = H[0];
            clus[e.clu] ? x = clus[e.clu] : (x = {},
            clus[e.clu] = x,
            x.sis = [],
            x.ptms = [],
            x.swg = 0,
            x.tac = 0,
            x.sos = []);
            e.cluo = x;
            x.swg += e.wg;
            x.sos.push(e);
            x.tac += G;
            sos.push(e);
            x = [];
            G = [];
            A = [];
            H = [];
            h = 0
        }
        e = f = 0
        } else
        e++;
    for (c = sos.length - 1; 0 <= c; c--)
        if (e = 1,
        x = sos[c].cluo) {
        for (h = x.sis.length - 1; 0 <= h; h--)
            if (x.sis[h].ip == sos[c].ip) {
            e = 0;
            break
            }
        1 == e && x.sis.push({
            ip: sos[c].ip
        })
    }

    const result = sos.map(item => `${item.ip}:${item.po}`);

    return [...new Set(result.concat(servers))];
}

function serverList(argOptions) {

    return new Promise((resolve) => {
        const options = {
            host: 'slither.io',
            path: '/i33628.txt'
        };
    
        http.request(options, (response) => {
            let responseData = '';

            response.on('error', () => {
                resolve();
            });
    
            response.on('data', (chunk) => {
                responseData += chunk;
            });
    
            response.on('end', async () => {
                
                const servers = parseServerString(responseData);
    
                if (argOptions.verbose) {
                    console.log(servers);
                }
    
                await saveServers(servers);
    
                resolve();
    
            });
        }).end();
    });
}

module.exports = serverList;