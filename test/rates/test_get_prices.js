const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../rates/get_prices');

const dayStart = Date.parse('2017-12-17T00:00:00.000Z') / 1000;
const makeRequest = (err, r, body) => ({}, cbk) => cbk(err, r, body);
const now = '2024-01-01T00:00:00.000Z';
const updatedISO = '2020-01-13T20:13:00+00:00';

// Rates without a time of their own are at the time of the clock
mock.timers.enable({apis: ['Date'], now: Date.parse(now)});

// Coinbase has a candle for the 10:00 hour of the day
const candles = [[dayStart + 60 * 60 * 10, 18900, 19200, 19000, 19200, 5]];

const makeArgs = override => {
  const args = {
    from: 'coindesk',
    request: makeRequest(
      null,
      {statusCode: 200},
      {bpi: {USD: {rate_float: 1}}, time: {updatedISO: updatedISO}},
    ),
    symbols: [],
  };

  Object.keys(override).forEach(key => args[key] = override[key]);

  return args;
};

const tests = [
  {
    args: makeArgs({from: undefined}),
    description: 'From is required',
    error: [400, 'ExpectedFromRateProviderToGetPriceRates'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'Request is required',
    error: [400, 'ExpectedRequestFunctionToGetExchangeRates'],
  },
  {
    args: makeArgs({symbols: undefined}),
    description: 'Symbols are required',
    error: [400, 'ExpectedSymbolsToGetFiatExchangeRates'],
  },
  {
    args: makeArgs({symbols: ['UNKNOWN']}),
    description: 'Known symbols are required',
    error: [400, 'UnsupportedFiatTypeForCoindeskFiatRateLookup'],
  },
  {
    args: makeArgs({date: 'yesterday', from: 'coinbase'}),
    description: 'A valid date is required for rates at a date',
    error: [400, 'ExpectedValidDateToGetExchangeRatesAtDate'],
  },
  {
    args: makeArgs({date: '2017-12-17T10:30:00Z'}),
    description: 'Rates at a date come from Coinbase',
    error: [400, 'ExpectedCoinbaseRateProviderForRatesAtDate'],
  },
  {
    args: makeArgs({}),
    description: 'Rate is returned',
    expected: {
      tickers: [{date: '2020-01-13T20:13:00.000Z', rate: 100, ticker: 'USD'}],
    },
  },
  {
    args: makeArgs({
      from: 'coingecko',
      request: ({}, cbk) => cbk(
        null,
        {statusCode: 200},
        {rates: {eur: {value: 2}, usd: {value: 1}}},
      ),
    }),
    description: 'Batch rates are returned',
    expected: {tickers: [{date: now, rate: 100, ticker: 'USD'}]},
  },
  {
    args: makeArgs({
      date: '2017-12-17T10:30:00Z',
      from: 'coinbase',
      request: makeRequest(null, {statusCode: 200}, candles),
      symbols: ['EUR'],
    }),
    description: 'Rates at the hour of a date are returned',
    expected: {
      tickers: [{
        date: '2017-12-17T10:00:00.000Z',
        rate: 1910000,
        ticker: 'EUR',
      }],
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await method(args), expected, 'Got expected rates');
    }

    return;
  });
});
