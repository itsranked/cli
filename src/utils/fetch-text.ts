import http from 'http';

export default async function fetchText(url: URL) {
  return new Promise<string>((resolve, reject) => {
    try {
      http
        .request(url, response => {
          let responseData = '';

          response.on('error', err => {
            reject(err);
          });

          response.on('data', chunk => {
            responseData += chunk;
          });

          response.on('end', async () => {
            resolve(responseData);
          });
        })
        .end();
    } catch (ex) {
      reject(ex);
    }
  });
}
