const asyncMap = require('async/map');
const asyncMapSeries = require('async/mapSeries');
const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../coinbase/get_coinbase_historic_price');

const dayStart = Date.parse('2017-12-17T00:00:00.000Z') / 1000;
const hour = 60 * 60;
const msPerSecond = 1000;

// Dates without offsets are read on a machine in a zone that is not UTC
process.env.TZ = 'America/Los_Angeles';

// The end of the day of the trades, and the start of the current hour
const dayEnd = (dayStart + 24 * hour) * msPerSecond;
const thisHour = Math.floor(Date.now() / msPerSecond / hour) * hour;

const thisHourDate = new Date(thisHour * msPerSecond).toISOString();

// Two hours of trades, at 10:00 and 12:00, newest first
const body = [
  [dayStart + hour * 12, 19900, 20100, 20000, 20000, 5],
  [dayStart + hour * 10, 18900, 19200, 19000, 19200, 5],
];

// A request function that counts its requests
const makeRequest = (requests, res = body) => (args, cbk) => {
  requests.push(args.url);

  return cbk(null, {statusCode: 200}, res);
};

// A request that answers only after every lookup has asked
const makeLateRequest = requests => (args, cbk) => {
  requests.push(args.url);

  return setImmediate(() => cbk(null, {statusCode: 200}, body));
};

// A request that is refused the first time
const makeRefusedRequest = requests => {
  const responses = [{message: 'Unavailable'}, body];

  return (args, cbk) => {
    requests.push(args.url);

    return cbk(null, {statusCode: 200}, responses.shift());
  };
};

// The market and the day of a request for candles
const fetchOf = url => {
  const [, market, day] = url.match(/products\/(.+)\/candles.*start=(.{10})/);

  return {day, market};
};

// Lookups of dates with one request function, with its requests counted
const makeLookups = ({dates, fiat, make, res}) => {
  const requests = [];

  const request = !make ? makeRequest(requests, res) : make(requests);

  return {
    requests,
    lookups: dates.map(date => ({date, request, fiat: fiat || 'USD'})),
  };
};

// Lookups of a date with request functions of their own, counted together
const makeOwnLookups = ({date}) => {
  const requests = [];

  return {
    requests,
    lookups: [1, 2].map(() => {
      return {date, fiat: 'USD', request: makeRequest(requests)};
    }),
  };
};

// Look up prices one after another, or together, at a time of the clock,
// with the prices or errors and the days of candles that were fetched
const lookUpPrices = async args => {
  const lookUp = (lookup, cbk) => {
    return method(lookup, (err, res) => cbk(null, !!err ? {err} : res));
  };

  // The clock can be set to a time of its own
  if (!!args.now) {
    mock.method(Date, 'now', () => args.now);
  }

  const run = !!args.is_together ? asyncMap : asyncMapSeries;

  const prices = await run(args.lookups, lookUp);

  mock.restoreAll();

  return {prices, fetches: args.requests.map(fetchOf)};
};

const tests = [
  {
    args: {date: 'yesterday', fiat: 'USD', request: makeRequest([])},
    description: 'A date is required',
    error: [400, 'ExpectedDateToGetCoinbaseHistoricPrice'],
  },
  {
    args: {date: '2017-02-30', fiat: 'USD', request: makeRequest([])},
    description: 'A date has to be on the calendar',
    error: [400, 'ExpectedDateToGetCoinbaseHistoricPrice'],
  },
  {
    args: {date: '2017-12-17', fiat: 'JPY', request: makeRequest([])},
    description: 'A fiat with a market is required',
    error: [400, 'UnsupportedFiatToGetCoinbaseHistoricPrice'],
  },
  {
    args: {date: '2017-12-17', fiat: 'USD'},
    description: 'A request function is required',
    error: [400, 'ExpectedRequestToGetCoinbaseHistoricPrice'],
  },
  {
    args: makeLookups({dates: ['2017-12-17T10:30:00.000Z']}),
    description: 'A date is priced at the typical price of its hour',
    expected: {
      fetches: [{day: '2017-12-17', market: 'BTC-USD'}],
      prices: [{cents: 1910000, date: '2017-12-17T10:00:00.000Z'}],
    },
  },
  {
    args: makeLookups({dates: ['2017-12-17T12:59:59.000Z']}),
    description: 'A date at the end of its hour is priced at its hour',
    expected: {
      fetches: [{day: '2017-12-17', market: 'BTC-USD'}],
      prices: [{cents: 2000000, date: '2017-12-17T12:00:00.000Z'}],
    },
  },
  {
    args: makeLookups({dates: ['2017-12-17T01:00:00.000Z']}),
    description: 'An hour without trades takes the nearest hour with trades',
    expected: {
      fetches: [{day: '2017-12-17', market: 'BTC-USD'}],
      prices: [{cents: 1910000, date: '2017-12-17T10:00:00.000Z'}],
    },
  },
  {
    args: makeLookups({
      dates: [
        '2017-12-17T10:30:00.000Z',
        '2017-12-17T12:59:59.000Z',
        '2017-12-17T01:00:00.000Z',
      ],
    }),
    description: 'The day is fetched once for every lookup',
    expected: {
      fetches: [{day: '2017-12-17', market: 'BTC-USD'}],
      prices: [
        {cents: 1910000, date: '2017-12-17T10:00:00.000Z'},
        {cents: 2000000, date: '2017-12-17T12:00:00.000Z'},
        {cents: 1910000, date: '2017-12-17T10:00:00.000Z'},
      ],
    },
  },
  {
    args: makeOwnLookups({date: '2017-12-17T10:30:00.000Z'}),
    description: 'The day is kept with its request function',
    expected: {
      fetches: [
        {day: '2017-12-17', market: 'BTC-USD'},
        {day: '2017-12-17', market: 'BTC-USD'},
      ],
      prices: [
        {cents: 1910000, date: '2017-12-17T10:00:00.000Z'},
        {cents: 1910000, date: '2017-12-17T10:00:00.000Z'},
      ],
    },
  },
  {
    args: Object.assign(makeLookups({
      dates: ['2017-12-17T10:00:00.000Z', '2017-12-17T12:00:00.000Z'],
      make: makeLateRequest,
    }),
    {is_together: true}),
    description: 'Lookups of the same day share one fetch',
    expected: {
      fetches: [{day: '2017-12-17', market: 'BTC-USD'}],
      prices: [
        {cents: 1910000, date: '2017-12-17T10:00:00.000Z'},
        {cents: 2000000, date: '2017-12-17T12:00:00.000Z'},
      ],
    },
  },
  {
    args: makeLookups({
      dates: ['2017-12-17T10:00:00Z', '2017-12-17T10:00:00Z'],
      fiat: 'EUR',
      make: makeRefusedRequest,
    }),
    description: 'A failed fetch is tried again by the next lookup',
    expected: {
      fetches: [
        {day: '2017-12-17', market: 'BTC-EUR'},
        {day: '2017-12-17', market: 'BTC-EUR'},
      ],
      prices: [
        {err: [503, 'CoinbaseRefusedCandlesRequest', {err: 'Unavailable'}]},
        {cents: 1910000, date: '2017-12-17T10:00:00.000Z'},
      ],
    },
  },
  {
    args: makeLookups({
      dates: [thisHourDate, thisHourDate],
      res: [[thisHour, 99, 101, 100, 100, 1]],
    }),
    description: 'A day that is not over is fetched again',
    expected: {
      fetches: [
        {day: thisHourDate.slice(0, 10), market: 'BTC-USD'},
        {day: thisHourDate.slice(0, 10), market: 'BTC-USD'},
      ],
      prices: [
        {cents: 10000, date: thisHourDate},
        {cents: 10000, date: thisHourDate},
      ],
    },
  },
  {
    args: Object.assign(makeLookups({
      dates: ['2017-12-17T10:30:00Z', '2017-12-17T10:30:00Z'],
    }),
    {now: dayEnd + 30 * 60 * msPerSecond}),
    description: 'Just after midnight the last hour can still be filling in',
    expected: {
      fetches: [
        {day: '2017-12-17', market: 'BTC-USD'},
        {day: '2017-12-17', market: 'BTC-USD'},
      ],
      prices: [
        {cents: 1910000, date: '2017-12-17T10:00:00.000Z'},
        {cents: 1910000, date: '2017-12-17T10:00:00.000Z'},
      ],
    },
  },
  {
    args: Object.assign(makeLookups({
      dates: ['2017-12-17T10:30:00Z', '2017-12-17T10:30:00Z'],
    }),
    {now: dayEnd + hour * msPerSecond}),
    description: 'A day is reused once it has been over for an hour',
    expected: {
      fetches: [{day: '2017-12-17', market: 'BTC-USD'}],
      prices: [
        {cents: 1910000, date: '2017-12-17T10:00:00.000Z'},
        {cents: 1910000, date: '2017-12-17T10:00:00.000Z'},
      ],
    },
  },
  {
    args: makeLookups({dates: ['2017-12-17T20:00:00']}),
    description: 'A time without an offset is read in UTC',
    expected: {
      fetches: [{day: '2017-12-17', market: 'BTC-USD'}],
      prices: [{cents: 2000000, date: '2017-12-17T12:00:00.000Z'}],
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await lookUpPrices(args), expected, 'Got expected prices');
    }

    return;
  });
});
