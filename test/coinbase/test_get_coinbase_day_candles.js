const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../coinbase/get_coinbase_day_candles');
const {name} = require('./../../package');
const {version} = require('./../../package');

const agent = `${name}/${version} (+https://github.com/alexbosworth/fiat)`;
const api = 'https://api.exchange.coinbase.com/products/';
const dayStart = Date.parse('2017-12-17T00:00:00.000Z') / 1000;
const hour = 60 * 60;
const range = 'start=2017-12-17T00:00:00.000Z&end=2017-12-17T23:59:59.000Z';

// The waits before trying again pass at once
mock.timers.enable({apis: ['setTimeout']});

// The url of the hourly candles of the day in a market
const urlFor = market => `${api}${market}/candles?granularity=3600&${range}`;

// Candles as Coinbase Exchange returns them: newest first, time low high open
// close volume, with one from the next day that was swept in by the range
const body = [
  [dayStart + hour * 24, 19000, 19200, 19100, 19050, 10],
  [dayStart + hour, 19100, 19600, 19200, 19500, 20],
  [dayStart, 19000, 19400, 19050, 19300, 30],
];

const makeRequest = (err, res) => (args, cbk) => cbk(err, null, res);

// A request answered by responses in turn, the first rate limited
const makeRateLimitedRequest = () => {
  const responses = [
    [null, {statusCode: 429}, {message: 'Public rate limit exceeded'}],
    [null, {statusCode: 200}, body],
  ];

  return (args, cbk) => {
    const [err, res, json] = responses.shift();

    // Exit early when there is no wait before trying again
    if (res.statusCode !== 429) {
      return cbk(err, res, json);
    }

    cbk(err, res, json);

    // The wait before trying again passes at once
    return mock.timers.runAll();
  };
};

// The candles of the day in time order
const candles = [
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
];

// Get the candles of a day, with the agents and the urls of the requests
const candlesOf = async args => {
  const requests = [];

  const res = await method(Object.assign({}, args, {
    request: (req, cbk) => {
      requests.push({agent: req.headers['user-agent'], url: req.url});

      return args.request(req, cbk);
    },
  }));

  return {requests, candles: res.candles};
};

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
    description: 'The hourly candles of the day are returned in time order',
    expected: {candles, requests: [{agent, url: urlFor('BTC-USD')}]},
  },
  {
    args: makeArgs({fiat: 'EUR'}),
    description: 'Another fiat is requested from its own market',
    expected: {candles, requests: [{agent, url: urlFor('BTC-EUR')}]},
  },
  {
    args: makeArgs({request: makeRateLimitedRequest()}),
    description: 'A rate limited request is retried',
    expected: {
      candles,
      requests: [
        {agent, url: urlFor('BTC-USD')},
        {agent, url: urlFor('BTC-USD')},
      ],
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await candlesOf(args), expected, 'Got expected candles');
    }

    return;
  });
});
