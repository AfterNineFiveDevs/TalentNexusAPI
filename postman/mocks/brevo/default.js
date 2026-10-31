// Local-only capture server. Contract: https://developers.brevo.com/reference/send-transac-email
// Test controls are not part of Brevo's API. Never deploy this capture server.
const http = require('node:http');
let messages = [];
let status = 201;
http
  .createServer((req, res) => {
    const reply = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/_test/messages')
      return reply(200, messages);
    if (req.method === 'POST' && req.url === '/_test/reset') {
      messages = [];
      status = 201;
      return reply(200, {});
    }
    if (req.method === 'POST' && req.url === '/_test/fail') {
      status = 503;
      return reply(200, {});
    }
    if (req.method !== 'POST' || req.url !== '/v3/smtp/email')
      return reply(501, { message: 'Endpoint not modeled' });
    const processBody = (body) => {
      if (
        !req.headers['api-key'] ||
        !body.sender?.email ||
        !body.to?.[0]?.email ||
        !body.subject ||
        !body.htmlContent
      )
        return reply(400, { message: 'Missing email fields' });
      if (status !== 201)
        return reply(status, {
          code: 'service_unavailable',
          message: 'Simulated provider outage',
        });
      messages.push(body);
      reply(201, { messageId: '<local-fixture@brevo.invalid>' });
    };
    if (req.body && typeof req.body === 'object') return processBody(req.body);
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply(400, { message: 'Invalid JSON' });
      }
      processBody(body);
    });
  })
  .listen(process.env.PORT);
