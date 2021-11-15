const {test} = require('@alexbosworth/tap');

const method = require('./../../rates/get_current_price');

const makeRequest = (err, r, body) => ({}, cbk) => cbk(err, r, body);
const updatedISO = '2020-01-13T20:13:00+00:00';

const makeArgs = override => {
  const args = {
    currency: 'BTC',
    fiat: 'USD',
    from: 'coindesk',
    request: makeRequest(
      null,
      {statusCode: 200},
      {bpi: {USD: {rate_float: 1}}, time: {updatedISO: updatedISO}},
    )
  };

  Object.keys(override).forEach(key => args[key] = override[key]);

  return args;
};

const tests = [
  {
    args: makeArgs({currency: undefined}),
    description: 'Currency is required',
    error: [400, 'ExpectedCurrencyToGetCurrentPriceFor'],
  },
  {
    args: makeArgs({fiat: undefined}),
    description: 'Fiat is required',
    error: [400, 'ExpectedFiatSymbolToGetCurrentPriceIn'],
  },
  {
    args: makeArgs({from: undefined}),
    description: 'From is required',
    error: [400, 'ExpectedRateProviderToGetCurrentPrice'],
  },
  {
    args: makeArgs({from: 'unknown'}),
    description: 'A known provider is required',
    error: [400, 'UnknownRateProviderToGetCurrentFiatPrice'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'Request is required',
    error: [400, 'ExpectedRequestFunctionToGetCurrentPrice'],
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
      await rejects(method(args), error, 'Got expected error');

      return end();
    }

    const {cents} = await method(args);

    equal(cents, expected.cents, 'Got expected exchange rate');

    return end();
  });
});
