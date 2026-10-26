const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../coinbase/get_coinbase_historic_price');

const dayStart = Date.parse('2017-12-17T00:00:00.000Z') / 1000;
const hour = 60 * 60;

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
];

tests.forEach(({args, description, error}) => {
  return test(description, async () => {
    await rejects(method(args), error, 'Got expected error');

    return;
  });
});

test('A date is priced at the typical price of its hour', async () => {
  const requests = [];

  const request = makeRequest(requests);

  const priced = date => method({date, request, fiat: 'USD'});

  // The 10:00 hour has a high of 19200, a low of 18900 and a close of 19200
  deepEqual(
    await priced('2017-12-17T10:30:00.000Z'),
    {cents: 1910000, date: '2017-12-17T10:00:00.000Z'},
    'Priced at its hour'
  );

  // The 12:00 hour has a high of 20100, a low of 19900 and a close of 20000
  deepEqual(
    await priced('2017-12-17T12:59:59.000Z'),
    {cents: 2000000, date: '2017-12-17T12:00:00.000Z'},
    'Priced at the end of its hour'
  );

  // An hour without trades takes the nearest hour that had them
  deepEqual(
    await priced('2017-12-17T01:00:00.000Z'),
    {cents: 1910000, date: '2017-12-17T10:00:00.000Z'},
    'Priced at the nearest hour with trades'
  );

  deepEqual(requests.length, 1, 'The day was fetched once for every lookup');

  // Another request function asks again
  await method({
    date: '2017-12-17T10:30:00.000Z',
    fiat: 'USD',
    request: makeRequest(requests),
  });

  deepEqual(requests.length, 2, 'The day is kept with its request function');

  return;
});

test('Lookups of the same day share one fetch', async () => {
  const requests = [];

  // A request that answers only after every lookup has asked
  const request = (args, cbk) => {
    requests.push(args.url);

    return setImmediate(() => cbk(null, {statusCode: 200}, body));
  };

  const dates = ['2017-12-17T10:00:00.000Z', '2017-12-17T12:00:00.000Z'];

  const prices = await Promise.all(dates.map(date => {
    return method({date, request, fiat: 'USD'});
  }));

  deepEqual(prices.map(n => n.cents), [1910000, 2000000], 'Both are priced');
  deepEqual(requests.length, 1, 'The day was fetched once');

  return;
});

test('A failed fetch is tried again by the next lookup', async () => {
  const requests = [];

  const responses = [[{message: 'Unavailable'}], [body]];

  const request = (args, cbk) => {
    requests.push(args.url);

    return cbk(null, {statusCode: 200}, responses.shift()[0]);
  };

  const args = {request, date: '2017-12-17T10:00:00Z', fiat: 'EUR'};

  await rejects(
    method(args),
    [503, 'CoinbaseRefusedCandlesRequest', {err: 'Unavailable'}],
    'The refusal is passed back'
  );

  deepEqual((await method(args)).cents, 1910000, 'Then it works');
  deepEqual(requests.length, 2, 'The day was fetched again');
  deepEqual(requests[0].includes('/products/BTC-EUR/'), true, 'In the fiat');

  return;
});

test('A day that is not over is fetched again', async () => {
  const requests = [];

  const now = Math.floor(Date.now() / 1000 / hour) * hour;

  const today = [[now, 99, 101, 100, 100, 1]];

  const request = makeRequest(requests, today);

  const date = new Date(now * 1000).toISOString();

  await method({date, request, fiat: 'USD'});
  await method({date, request, fiat: 'USD'});

  deepEqual(requests.length, 2, 'More hours may have traded since');

  return;
});

test('A day is only reused once it has been over for an hour', async () => {
  const {now} = Date;
  const requests = [];

  const args = {
    date: '2017-12-17T10:30:00Z',
    fiat: 'USD',
    request: makeRequest(requests),
  };

  const dayEnd = (dayStart + 24 * hour) * 1000;

  try {
    // Just after midnight the last hour of the day can still be filling in
    Date.now = () => dayEnd + 30 * 60 * 1000;

    await method(args);
    await method(args);

    deepEqual(requests.length, 2, 'The day is fetched again');

    // An hour after the day ended its candles are settled
    Date.now = () => dayEnd + hour * 1000;

    await method(args);
    await method(args);

    deepEqual(requests.length, 3, 'The settled day is reused');
  } finally {
    Date.now = now;
  }

  return;
});

test('A time without an offset is read in UTC', async () => {
  const {TZ} = process.env;
  const requests = [];

  try {
    process.env.TZ = 'America/Los_Angeles';

    await method({
      date: '2017-12-17T20:00:00',
      fiat: 'USD',
      request: makeRequest(requests),
    });

    deepEqual(requests[0].includes('start=2017-12-17T'), true, 'Its UTC day');
  } finally {
    if (TZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = TZ;
    }
  }

  return;
});
