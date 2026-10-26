const {deepStrictEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../rates/get_prices');

const makeRequest = (err, r, body) => ({}, cbk) => cbk(err, r, body);
const updatedISO = '2020-01-13T20:13:00+00:00';

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
    expected: {rate: 100},
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
    expected: {rate: 100},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      const [{rate}] = (await method(args)).tickers;

      deepStrictEqual(rate, expected.rate, 'Got expected exchange rate');
    }

    return;
  });
});

test('Rates at the hour of a date are returned', async () => {
  const dayStart = Date.parse('2017-12-17T00:00:00.000Z') / 1000;

  // Coinbase has a candle for the 10:00 hour of the day
  const candles = [[dayStart + 60 * 60 * 10, 18900, 19200, 19000, 19200, 5]];

  const {tickers} = await method({
    date: '2017-12-17T10:30:00Z',
    from: 'coinbase',
    request: makeRequest(null, {statusCode: 200}, candles),
    symbols: ['EUR'],
  });

  deepStrictEqual(
    tickers,
    [{date: '2017-12-17T10:00:00.000Z', rate: 1910000, ticker: 'EUR'}],
    'The rate is the price of the hour of the date'
  );

  return;
});
