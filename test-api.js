/**
 * Quick test script for the POST /crawl API endpoint.
 * Run: node test-api.js
 */

const http = require('http');

const payload = JSON.stringify({
  urls: [
    'https://cmlabs.co',
    'https://sequence.day',
    'https://github.com',
  ],
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/crawl',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  },
};

console.log('Sending POST /crawl request...\n');
const startTime = Date.now();

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    const elapsed = Date.now() - startTime;
    console.log(`Response Status: ${res.statusCode}`);
    console.log(`Total Time: ${elapsed}ms\n`);
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch {
      console.log(data);
    }
  });
});

req.on('error', (err) => {
  console.error('Request failed:', err.message);
});

req.write(payload);
req.end();
