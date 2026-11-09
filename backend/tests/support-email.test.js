const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const {sendResendEmail, ResendDeliveryError} = require('../src/modules/support/resend');
const supportRoutes = require('../src/modules/support/routes');

const originalFetch = global.fetch;
const envNames = ['RESEND_API_KEY', 'RESEND_TEMPLATE_ID', 'RESEND_FROM_EMAIL', 'CONTACT_EMAIL'];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
for (const [name, value] of Object.entries({
  RESEND_API_KEY: 'test-api-key',
  RESEND_TEMPLATE_ID: 'support-template',
  RESEND_FROM_EMAIL: 'RoomRent <support@example.com>',
  CONTACT_EMAIL: 'help@example.com',
})) process.env[name] = value;

const app = express();
app.use(express.json());
app.use('/api/support', supportRoutes);
app.use((error, request, response, next) => {
  response.status(error.status || 500).json({error: {message: error.message}});
});

async function postTicket(body) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    return await new Promise((resolve, reject) => {
      const request = http.request({
        host: '127.0.0.1',
        port: server.address().port,
        path: '/api/support/tickets',
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
      }, response => {
        let content = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { content += chunk; });
        response.on('end', () => resolve({status: response.statusCode, body: JSON.parse(content)}));
      });
      request.on('error', reject);
      request.end(JSON.stringify(body));
    });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test.after(() => {
  global.fetch = originalFetch;
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

test('sends email payloads to Resend using the configured API key', async () => {
  let request;
  const result = await sendResendEmail({
    from: 'RoomRent <support@example.com>',
    to: ['help@example.com'],
    template: {id: 'support-template', variables: {ticketId: 'RR-1'}},
  }, {
    apiKey: 'test-api-key',
    fetchImpl: async (url, options) => {
      request = {url, options};
      return {ok: true, status: 200, json: async () => ({id: 'email-1'})};
    },
  });

  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.headers.Authorization, 'Bearer test-api-key');
  assert.deepEqual(JSON.parse(request.options.body), {
    from: 'RoomRent <support@example.com>',
    to: ['help@example.com'],
    template: {id: 'support-template', variables: {ticketId: 'RR-1'}},
  });
  assert.deepEqual(result, {id: 'email-1'});
});

test('surfaces provider rejection without pretending delivery succeeded', async () => {
  await assert.rejects(
    sendResendEmail({to: ['help@example.com']}, {
      apiKey: 'test-api-key',
      fetchImpl: async () => ({ok: false, status: 422, json: async () => ({message: 'Invalid sender'})}),
    }),
    error => error instanceof ResendDeliveryError && /Invalid sender/.test(error.message),
  );
});

test('does not make a Resend request without an API key', async () => {
  let requested = false;
  await assert.rejects(
    sendResendEmail({}, {apiKey: '', fetchImpl: async () => {requested = true;}}),
    error => error instanceof ResendDeliveryError && /RESEND_API_KEY/.test(error.message),
  );
  assert.equal(requested, false);
});

test('creates a support ticket email and sends submitter confirmation', async () => {
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({url, email: JSON.parse(options.body)});
    return {ok: true, status: 200, json: async () => ({id: `email-${requests.length}`})};
  };
  const result = await postTicket({
    name: 'A User',
    email: 'user@example.com',
    subject: 'Need help signing in',
    category: 'account',
    message: 'I cannot sign in to my RoomRent account.',
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.data.confirmationSent, true);
  assert.match(result.body.data.ticketId, /^RR-\d{8}-[A-F0-9]{8}$/);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].email.to, ['help@example.com']);
  assert.equal(requests[0].email.reply_to, 'user@example.com');
  assert.equal(requests[0].email.template.id, 'support-template');
  assert.equal(requests[0].email.template.variables.PHONE, 'Not provided');
  assert.equal(requests[0].email.template.variables.phone, 'Not provided');
  assert.equal(requests[0].email.template.variables.ticketId, result.body.data.ticketId);
  assert.deepEqual(requests[1].email.to, ['user@example.com']);
  assert.match(requests[1].email.subject, new RegExp(result.body.data.ticketId));
});

test('reports when support receives a ticket but confirmation delivery fails', async () => {
  let count = 0;
  global.fetch = async () => {
    count += 1;
    if (count === 2) throw Error('network unavailable');
    return {ok: true, status: 200, json: async () => ({id: 'support-email'})};
  };
  const result = await postTicket({
    name: 'A User',
    email: 'user@example.com',
    subject: 'Need help signing in',
    category: 'account',
    message: 'I cannot sign in to my RoomRent account.',
  });

  assert.equal(result.status, 202);
  assert.equal(result.body.data.confirmationSent, false);
  assert.equal(count, 2);
});

test('rejects invalid support requests before sending mail', async () => {
  let requested = false;
  global.fetch = async () => { requested = true; };
  const result = await postTicket({email: 'invalid'});

  assert.equal(result.status, 400);
  assert.equal(requested, false);
});
