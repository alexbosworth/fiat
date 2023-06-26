const {deepStrictEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {getCoingeckoRates} = require('./../../coingecko');

const updatedISO = '2020-01-13T20:13:00+00:00';

const body = {rates: {eur: {value: 1}, usd: {value: 2}}};

const makeRequest = (err, res) => ({}, cbk) => cbk(err, null, res);

const makeArgs = override => {
  const args = {request: makeRequest(null, body), symbols: ['EUR']};

  Object.keys(override).forEach(key => args[key] = override[key]);

  return args;
};

const tests = [
  {
    args: makeArgs({symbols: undefined}),
    description: 'Symbols are required',
    error: [400, 'ExpectedSymbolsToGetCoingeckoExchangeRates'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'A request function is required',
    error: [400, 'ExpectedRequestFunctionToGetExchangeRates'],
  },
  {
    args: makeArgs({request: makeRequest('err')}),
    description: 'Request cannot return error',
    error: [503, 'UnexpectedErrorGettingCoingeckoRates', {err: 'err'}],
  },
  {
    args: makeArgs({request: makeRequest(null, null)}),
    description: 'Response must return a body',
    error: [503, 'ExpectedRatesInCoingeckoResponse'],
  },
  {
    args: makeArgs({request: makeRequest(null, {})}),
    description: 'Response must return rates',
    error: [503, 'ExpectedRatesInCoingeckoResponse'],
  },
  {
    args: makeArgs({request: makeRequest(null, {rates: {}})}),
    description: 'Response is expected to have a result',
    error: [404, 'CoingeckoRateLookupSymbolNotFound'],
  },
  {
    args: makeArgs({symbols: []}),
    description: 'Got default exchange rate',
    expected: {
      tickers: [{
        date: '2020-01-13T20:13:00.000Z',
        rate: 200,
        ticker: 'USD',
      }],
    },
  },
  {
    args: makeArgs({}),
    description: 'Got exchange rates',
    expected: {
      tickers: [{
        date: '2020-01-13T20:13:00.000Z',
        rate: 100,
        ticker: 'EUR',
      }],
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getCoingeckoRates(args), error, 'Got expected error');

      return;
    }

    const [expectedTicker] = expected.tickers;
    const [ticker] = (await getCoingeckoRates(args)).tickers;

    deepStrictEqual(!!ticker.date, true, 'Got ticker date');
    deepStrictEqual(ticker.rate, expectedTicker.rate, 'Got expected rate');
    deepStrictEqual(ticker.ticker, expectedTicker.ticker, 'Got symbol');

    return;
  });
});
