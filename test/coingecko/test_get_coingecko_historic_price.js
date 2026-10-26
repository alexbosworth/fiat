const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../scripts/compare/get_coingecko_historic_price');

const body = {market_data: {current_price: {usd: 42345.678}}};

const makeRequest = (err, res) => (args, cbk) => cbk(err, null, res);

const makeArgs = override => {
  const args = {date: '2024-01-02', request: makeRequest(null, body)};

  Object.keys(override).forEach(key => args[key] = override[key]);

  return args;
};

const tests = [
  {
    args: makeArgs({date: '2024-1-2'}),
    description: 'A formatted date is required',
    error: [400, 'ExpectedYyyyMmDdDateToGetCoingeckoHistoricPrice'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'A request function is required',
    error: [400, 'ExpectedRequestFunctionToGetHistoricPrice'],
  },
  {
    args: makeArgs({request: makeRequest('err')}),
    description: 'Request cannot return error',
    error: [503, 'UnexpectedErrorGettingCoingeckoPrice', {err: 'err'}],
  },
  {
    args: makeArgs({request: makeRequest(null, {})}),
    description: 'Market data is expected',
    error: [503, 'ExpectedMarketDataInCoingeckoResponse'],
  },
  {
    args: makeArgs({
      request: makeRequest(null, {
        error: {status: {error_code: 10012, error_message: 'Too far back'}},
      }),
    }),
    description: 'A refusal nested under an error key is passed back',
    error: [503, 'CoingeckoRefusedHistoricPriceRequest', {
      err: 'Too far back',
    }],
  },
  {
    args: makeArgs({
      request: makeRequest(null, {
        status: {error_code: 10005, error_message: 'Missing API key'},
      }),
    }),
    description: 'A refusal with a top level status is passed back',
    error: [503, 'CoingeckoRefusedHistoricPriceRequest', {
      err: 'Missing API key',
    }],
  },
  {
    args: makeArgs({
      request: makeRequest(null, {market_data: {current_price: {}}}),
    }),
    description: 'A USD price is expected',
    error: [503, 'ExpectedUsdPriceInCoingeckoResponse'],
  },
  {
    args: makeArgs({}),
    description: 'The price at the start of the day is returned',
    expected: {cents: 4234568},
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

test('The date is passed in CoinGecko day month year order', async () => {
  const urls = [];

  await method({
    date: '2024-01-02',
    request: (args, cbk) => {
      urls.push(args.url);

      return cbk(null, null, body);
    },
  });

  deepEqual(urls[0].includes('date=02-01-2024'), true, 'Date is reversed');

  return;
});

test('A rate limited request is retried', async ({mock}) => {
  mock.timers.enable({apis: ['setTimeout']});

  const responses = [
    [null, {statusCode: 429}, {status: {error_code: 429}}],
    [null, {statusCode: 200}, body],
  ];

  const res = await method({
    date: '2024-01-02',
    request: (args, cbk) => {
      cbk(...responses.shift());

      // The wait before trying again passes at once
      return mock.timers.runAll();
    },
  });

  deepEqual(res, {cents: 4234568}, 'The retried request succeeds');
  deepEqual(responses.length, 0, 'Both responses were used');

  return;
});

test('A refusal from CoinGecko is passed back with its message', async () => {
  await rejects(
    method({
      date: '2024-01-02',
      request: (args, cbk) => cbk(null, {statusCode: 401}, {
        status: {error_code: 10012, error_message: 'Too far back'},
      }),
    }),
    [503, 'CoingeckoRefusedHistoricPriceRequest', {err: 'Too far back'}],
    'The refusal is explained'
  );

  await rejects(
    method({
      date: '2024-01-02',
      request: (args, cbk) => cbk(null, null, {error: 'coin not found'}),
    }),
    [503, 'CoingeckoRefusedHistoricPriceRequest', {err: 'coin not found'}],
    'A plain error is explained'
  );

  return;
});

test('A descriptive user agent is sent', async () => {
  const requests = [];

  await method({
    date: '2024-01-02',
    request: (args, cbk) => {
      requests.push(args);

      return cbk(null, null, body);
    },
  });

  const [{headers}] = requests;

  deepEqual(/fiat\/\d/.test(headers['user-agent']), true, 'Agent is named');

  return;
});
