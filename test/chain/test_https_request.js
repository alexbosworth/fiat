const EventEmitter = require('events');
const https = require('https');
const {deepEqual} = require('node:assert').strict;
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

// Make a request answered by a script, with every call back of the request
const requestWith = ({script}) => new Promise(resolve => {
  const calls = [];

  https.get = answer(script);

  method({url: 'https://example.com/'}, (...args) => calls.push(args));

  // Calls back come after the response, and are waited for a little longer
  return setImmediate(() => setImmediate(() => {
    https.get = get;

    return resolve({calls});
  }));
});

const tests = [
  {
    args: {
      script: ({res}) => {
        res.emit('data', Buffer.from('{"a":'));
        res.emit('data', Buffer.from('1}'));

        res.complete = true;

        res.emit('end');
        res.emit('close');
      },
    },
    description: 'A response is passed back with its body',
    expected: {calls: [[null, {statusCode: 200}, {a: 1}]]},
  },
  {
    args: {
      script: ({res}) => {
        res.emit('data', Buffer.from('not json'));

        res.complete = true;

        res.emit('end');
      },
    },
    description: 'A response that is not JSON is passed back without a body',
    expected: {calls: [[null, {statusCode: 200}, undefined]]},
  },
  {
    args: {
      script: ({res}) => {
        res.emit('data', Buffer.from('{"a":'));
        res.emit('error', new Error('aborted'));
        res.emit('close');
      },
    },
    description: 'A response cut off by an error passes back the error',
    expected: {calls: [[new Error('aborted'), undefined, undefined]]},
  },
  {
    args: {
      script: ({res}) => {
        res.emit('data', Buffer.from('{"a":'));
        res.emit('close');
      },
    },
    description: 'A response that closes without an error is cut off too',
    expected: {
      calls: [[new Error('ResponseClosedBeforeItsEnd'), undefined, undefined]],
    },
  },
  {
    args: {
      script: ({req, res}) => {
        res.emit('error', new Error('first'));
        req.emit('error', new Error('second'));
        res.emit('close');
      },
    },
    description: 'The callback is only called for the first outcome',
    expected: {calls: [[new Error('first'), undefined, undefined]]},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    deepEqual(await requestWith(args), expected, 'Got expected calls');

    return;
  });
});
