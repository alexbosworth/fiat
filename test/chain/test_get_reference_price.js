const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../scripts/compare/get_reference_price');

const dayLength = 'yyyy-mm-dd'.length;
const hour = 60 * 60;
const isCandles = url => url.includes('/candles');
const msPerDay = 1000 * 60 * 60 * 24;
const refusal = {status: {error_code: 10012, error_message: 'Too far back'}};

// A recent day that CoinGecko serves
const yesterday = new Date(Date.now() - msPerDay).toISOString();

const recent = yesterday.slice(Number(), dayLength);

const dayStart = Date.parse(`${recent}T00:00:00.000Z`) / 1000;

// Two hours of trading: a quiet hour around 100 and a busy hour around 110
const candles = [
  [dayStart + hour, 109, 111, 110, 110, 30],
  [dayStart, 99, 101, 100, 100, 10],
];

// CoinGecko answers with the day's start price, the next day's being 120
const geckoFor = url => {
  const [, dmy] = url.match(/date=(\d{2}-\d{2}-\d{4})/);

  const day = dmy.split('-').reverse().join('-');

  return {market_data: {current_price: {usd: day === recent ? 100 : 120}}};
};

// A request function that answers each provider with its own body
const makeRequest = ({coinbase, coingecko}) => (args, cbk) => {
  if (isCandles(args.url)) {
    return cbk(coinbase[0], null, coinbase[1]);
  }

  return cbk(coingecko[0], null, coingecko[1] || geckoFor(args.url));
};

const makeArgs = override => {
  const args = {
    date: recent,
    request: makeRequest({coinbase: [null, candles], coingecko: [null]}),
  };

  Object.keys(override).forEach(key => args[key] = override[key]);

  return args;
};

const tests = [
  {
    args: makeArgs({date: '2017-12-7'}),
    description: 'A formatted date is required',
    error: [400, 'ExpectedYyyyMmDdDateToGetReferencePrice'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'A request function is required',
    error: [400, 'ExpectedRequestFunctionToGetReferencePrice'],
  },
  {
    args: makeArgs({
      request: makeRequest({coinbase: ['err'], coingecko: [null, refusal]}),
    }),
    description: 'Both providers failing is an error with both failures',
    error: [503, 'FailedToGetReferencePriceFromProviders', {
      coinbase: [503, 'UnexpectedErrorGettingCoinbaseCandles', {err: 'err'}],
      coingecko: [503, 'CoingeckoRefusedHistoricPriceRequest', {
        err: 'Too far back',
      }],
    }],
  },
  {
    args: makeArgs({}),
    description: 'The reference is the median of the hourly prices',
    // Typical prices 100 and 110 have a median of 105, and weighted 10 and 30
    // they have a volume weighted average of 107.5
    expected: {
      cents: 10500,
      close_cents: 11000,
      hours: 2,
      open_cents: 10000,
      source: 'coinbase',
      vwap_cents: 10750,
    },
  },
  {
    args: makeArgs({
      request: makeRequest({coinbase: ['err'], coingecko: [null]}),
    }),
    description: 'CoinGecko stands in when the candles cannot be had',
    // The geometric mean of 100 and 120 is the reference
    expected: {
      cents: 10954,
      close_cents: 12000,
      coinbase_error: [503, 'UnexpectedErrorGettingCoinbaseCandles', {
        err: 'err',
      }],
      open_cents: 10000,
      source: 'coingecko',
    },
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

test('The median is the middle hour of an odd count of hours', async () => {
  // A third hour trading at 140 is the high end, leaving 110 in the middle
  const three = [[dayStart + hour * 2, 139, 141, 140, 140, 1]].concat(candles);

  const res = await method({
    date: recent,
    request: makeRequest({coinbase: [null, three], coingecko: [null]}),
  });

  deepEqual(res.cents, 11000, 'The middle hour is the reference');
  deepEqual(res.close_cents, 14000, 'The close is the last hour close');

  return;
});

test('A day without volume has no volume weighted average', async () => {
  const quiet = candles.map(candle => candle.slice(0, 5).concat([0]));

  const res = await method({
    date: recent,
    request: makeRequest({coinbase: [null, quiet], coingecko: [null]}),
  });

  deepEqual(res.cents, 10500, 'The median does not need volume');
  deepEqual(res.vwap_cents, undefined, 'There is no volume to weigh by');

  return;
});

test('A day too old for CoinGecko has no stand in', async () => {
  const asked = [];

  await rejects(
    method({
      date: '2017-12-17',
      request: (args, cbk) => {
        asked.push(args.url);

        return cbk('err');
      },
    }),
    [503, 'UnexpectedErrorGettingCoinbaseCandles', {err: 'err'}],
    'The candles failure is passed back as is'
  );

  deepEqual(asked.length, 1, 'Only the candles were asked for');
  deepEqual(isCandles(asked[0]), true, 'CoinGecko was not asked at all');

  return;
});
