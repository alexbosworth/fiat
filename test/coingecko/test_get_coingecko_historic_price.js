const {deepEqual} = require('node:assert').strict;
const {mock} = require('node:test');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../scripts/compare/get_coingecko_historic_price');
const {name} = require('./../../package');
const {version} = require('./../../package');

const agent = `${name}/${version} (+https://github.com/alexbosworth/fiat)`;
const api = 'https://api.coingecko.com/api/v3/coins/bitcoin/history';
const body = {market_data: {current_price: {usd: 42345.678}}};

// The waits before trying again pass at once
mock.timers.enable({apis: ['setTimeout']});

// A request answered by responses in turn, the first rate limited
const makeRateLimitedRequest = () => {
  const responses = [
    [null, {statusCode: 429}, {status: {error_code: 429}}],
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

// Get a price, with the agents and the urls of the requests for it
const priceOf = async args => {
  const requests = [];

  const res = await method(Object.assign({}, args, {
    request: (req, cbk) => {
      requests.push({agent: req.headers['user-agent'], url: req.url});

      return args.request(req, cbk);
    },
  }));

  return {requests, cents: res.cents};
};

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
    description: 'The price at the start of the day is asked for in d-m-y',
    expected: {
      cents: 4234568,
      requests: [{agent, url: `${api}?date=02-01-2024&localization=false`}],
    },
  },
  {
    args: makeArgs({request: makeRateLimitedRequest()}),
    description: 'A rate limited request is retried',
    expected: {
      cents: 4234568,
      requests: [
        {agent, url: `${api}?date=02-01-2024&localization=false`},
        {agent, url: `${api}?date=02-01-2024&localization=false`},
      ],
    },
  },
  {
    args: makeArgs({
      request: (args, cbk) => cbk(null, {statusCode: 401}, {
        status: {error_code: 10012, error_message: 'Too far back'},
      }),
    }),
    description: 'A refusal from CoinGecko is passed back with its message',
    error: [503, 'CoingeckoRefusedHistoricPriceRequest', {
      err: 'Too far back',
    }],
  },
  {
    args: makeArgs({
      request: (args, cbk) => cbk(null, null, {error: 'coin not found'}),
    }),
    description: 'A plain error from CoinGecko is passed back',
    error: [503, 'CoingeckoRefusedHistoricPriceRequest', {
      err: 'coin not found',
    }],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await priceOf(args), expected, 'Got expected result');
    }

    return;
  });
});
