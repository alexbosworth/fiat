const EventEmitter = require('events');
const https = require('https');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../scripts/https_request');

const {get} = https;

// Answer a request with a response that does what the script says to
const answer = script => (url, options, onResponse) => {
  const req = new EventEmitter();
  const res = new EventEmitter();

  req.destroy = err => req.emit('error', err);

  res.complete = false;
  res.statusCode = 200;

  setImmediate(() => {
    onResponse(res);

    return script({req, res});
  });

  return req;
};

const request = () => new Promise((resolve, reject) => {
  return method({url: 'https://example.com/'}, (err, res, body) => {
    return !!err ? reject(err) : resolve({body, res});
  });
});

test('A response is passed back with its body', async () => {
  try {
    https.get = answer(({res}) => {
      res.emit('data', Buffer.from('{"a":'));
      res.emit('data', Buffer.from('1}'));

      res.complete = true;

      res.emit('end');
      res.emit('close');
    });

    deepEqual(await request(), {body: {a: 1}, res: {statusCode: 200}});

    https.get = answer(({res}) => {
      res.emit('data', Buffer.from('not json'));

      res.complete = true;

      res.emit('end');
    });

    deepEqual(await request(), {body: undefined, res: {statusCode: 200}});
  } finally {
    https.get = get;
  }

  return;
});

test('A response cut off before its end is an error', async () => {
  const calls = [];

  try {
    https.get = answer(({res}) => {
      res.emit('data', Buffer.from('{"a":'));
      res.emit('error', new Error('aborted'));
      res.emit('close');
    });

    await rejects(request(), new Error('aborted'), 'The error is passed back');

    https.get = answer(({res}) => {
      res.emit('data', Buffer.from('{"a":'));
      res.emit('close');
    });

    await rejects(
      request(),
      new Error('ResponseClosedBeforeItsEnd'),
      'A response that closes without an error is cut off too'
    );

    https.get = answer(({req, res}) => {
      res.emit('error', new Error('first'));
      req.emit('error', new Error('second'));
      res.emit('close');
    });

    method({url: 'https://example.com/'}, err => calls.push(err.message));

    await new Promise(resolve => setImmediate(() => setImmediate(resolve)));

    deepEqual(calls, ['first'], 'The callback is called once');
  } finally {
    https.get = get;
  }

  return;
});
