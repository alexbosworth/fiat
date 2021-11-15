const {test} = require('@alexbosworth/tap');

const {getCoinbaseCurrentPrice} = require('./../../coinbase');

const makeRequest = (err, r, body) => ({}, cbk) => cbk(err, r, body);

const makeArgs = override => {
  const args = {
    currency: 'BTC',
    fiat: 'USD',
    request: makeRequest(null, {statusCode: 200}, {data: {amount: 1}}),
  };

  Object.keys(override).forEach(key => args[key] = override[key]);

  return args;
};

const tests = [
  {
    args: makeArgs({currency: undefined}),
    description: 'Currency is required',
    error: [400, 'ExpectedCurrencyCodeToGetCoinbaseCurrentPrice'],
  },
  {
    args: makeArgs({fiat: undefined}),
    description: 'Fiat is required',
    error: [400, 'ExpectedKnownCurrencyToGetCoinbaseCurrentPrice'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'Request is required',
    error: [400, 'ExpectedRequestMethodToGetCoinbaseCurrentPrice'],
  },
  {
    args: makeArgs({request: makeRequest('err')}),
    description: 'Request errors are passed back',
    error: [503, 'UnexpectedErrorGettingCoinbasePrice', {err: 'err'}],
  },
  {
    args: makeArgs({request: makeRequest()}),
    description: 'Request response is expected',
    error: [503, 'ExpectedCurrencyRateDataFromCoinbase'],
  },
  {
    args: makeArgs({request: makeRequest(null, null, {})}),
    description: 'Request response data is expected',
    error: [503, 'ExpectedCurrencyRateDataFromCoinbase'],
  },
  {
    args: makeArgs({request: makeRequest(null, null, {data: {}})}),
    description: 'Request response amount is expected',
    error: [503, 'ExpectedCurrencyRateDataFromCoinbase'],
  },
  {
    args: makeArgs({}),
    description: 'Rate is returned',
    expected: {cents: 100},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({end, equal, rejects}) => {
    if (!!error) {
      await rejects(getCoinbaseCurrentPrice(args), error, 'Got error');
    } else {
      const {cents, date} = await getCoinbaseCurrentPrice(args);

      equal(cents, expected.cents, 'Got expected exchange rate');
      equal(!!date, true, 'Got a date value');
    }

    return end();
  });
});
