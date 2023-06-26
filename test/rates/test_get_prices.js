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
