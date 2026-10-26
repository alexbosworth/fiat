const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../coinbase/get_coinbase_day_candles');

const dayStart = Date.parse('2017-12-17T00:00:00.000Z') / 1000;
const hour = 60 * 60;

// Candles as Coinbase Exchange returns them: newest first, time low high open
// close volume, with one from the next day that was swept in by the range
const body = [
  [dayStart + hour * 24, 19000, 19200, 19100, 19050, 10],
  [dayStart + hour, 19100, 19600, 19200, 19500, 20],
  [dayStart, 19000, 19400, 19050, 19300, 30],
];

const makeRequest = (err, res) => (args, cbk) => cbk(err, null, res);

const makeArgs = override => {
  const args = {date: '2017-12-17', request: makeRequest(null, body)};

  Object.keys(override).forEach(key => args[key] = override[key]);

  return args;
};

const tests = [
  {
    args: makeArgs({date: '2017-12-7'}),
    description: 'A formatted date is required',
    error: [400, 'ExpectedYyyyMmDdDateToGetCoinbaseDayCandles'],
  },
  {
    args: makeArgs({fiat: 'JPY'}),
    description: 'A fiat with a Coinbase Exchange market is required',
    error: [400, 'UnsupportedFiatToGetCoinbaseDayCandles'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'A request function is required',
    error: [400, 'ExpectedRequestFunctionToGetCoinbaseDayCandles'],
  },
  {
    args: makeArgs({request: makeRequest('err')}),
    description: 'Request cannot return error',
    error: [503, 'UnexpectedErrorGettingCoinbaseCandles', {err: 'err'}],
  },
  {
    args: makeArgs({request: makeRequest(null, {message: 'NotFound'})}),
    description: 'A refusal is passed back with its message',
    error: [503, 'CoinbaseRefusedCandlesRequest', {err: 'NotFound'}],
  },
  {
    args: makeArgs({request: makeRequest(null, {})}),
    description: 'An array of candles is expected',
    error: [503, 'ExpectedArrayOfCandlesInCoinbaseResponse'],
  },
  {
    args: makeArgs({request: makeRequest(null, [[dayStart, 'low']])}),
    description: 'Candle values are expected',
    error: [503, 'ExpectedCandleValuesInCoinbaseResponse'],
  },
  {
    args: makeArgs({request: makeRequest(null, [body[0]])}),
    description: 'Candles within the day are expected',
    error: [503, 'ExpectedCandlesForDayInCoinbaseResponse'],
  },
  {
    args: makeArgs({}),
    description: 'The candles of the day are returned in time order',
    expected: {
      candles: [
        {
          close: 19300,
          high: 19400,
          low: 19000,
          open: 19050,
          time: dayStart,
          volume: 30,
        },
        {
          close: 19500,
          high: 19600,
          low: 19100,
          open: 19200,
          time: dayStart + hour,
          volume: 20,
        },
      ],
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await method(args), expected, 'Got expected result');
    }

    return;
  });
});

test('The day is requested as hourly candles with a user agent', async () => {
  const requests = [];

  await method({
    date: '2017-12-17',
    request: (args, cbk) => {
      requests.push(args);

      return cbk(null, null, body);
    },
  });

  const [{headers, url}] = requests;

  deepEqual(url.includes('/products/BTC-USD/candles?'), true, 'Product');
  deepEqual(url.includes('granularity=3600'), true, 'Hourly candles');
  deepEqual(url.includes('start=2017-12-17T00:00:00.000Z'), true, 'Start');
  deepEqual(url.includes('end=2017-12-17T23:59:59.000Z'), true, 'End');
  deepEqual(/^@alexbosworth\/fiat\//.test(headers['user-agent']), true, 'UA');

  return;
});

test('Another fiat is requested from its own market', async () => {
  const urls = [];

  await method({
    date: '2017-12-17',
    fiat: 'EUR',
    request: (args, cbk) => {
      urls.push(args.url);

      return cbk(null, null, body);
    },
  });

  deepEqual(urls[0].includes('/products/BTC-EUR/candles?'), true, 'Market');

  return;
});

test('A rate limited request is retried', async ({mock}) => {
  mock.timers.enable({apis: ['setTimeout']});

  const responses = [
    [null, {statusCode: 429}, {message: 'Public rate limit exceeded'}],
    [null, {statusCode: 200}, body],
  ];

  const {candles} = await method({
    date: '2017-12-17',
    request: (args, cbk) => {
      cbk(...responses.shift());

      // The wait before trying again passes at once
      return mock.timers.runAll();
    },
  });

  deepEqual(candles.length, 2, 'The retried request succeeds');
  deepEqual(responses.length, 0, 'Both responses were used');

  return;
});
