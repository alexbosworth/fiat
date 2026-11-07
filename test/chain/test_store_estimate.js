const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/estimates/store_estimate');
const {methodVersion} = require('./../../chain/known');

const day = '2024-01-01';
const path = '/data/prices.json';
const {parse} = JSON;
const {stringify} = JSON;
const {version} = methodVersion({});

// The log of a full day price
const dayLog = {
  chain_price: {
    agreement: 0.9,
    blocks: 144,
    confidence: 1.2,
    date: day,
    dispersion: 0.02,
    drift: undefined,
    is_unsettled: undefined,
    is_widened: undefined,
    outputs: 9,
    payments: 5,
    price: '10000.00',
    rivalry: 0.1,
    stability: 0,
  },
};

// A full day price as it is known
const dayPrice = {
  version,
  agreement: 0.9,
  block_id: '00',
  blocks: [1, 144],
  cents: 1000000,
  confidence: 1.2,
  dispersion: 0.02,
  drift: undefined,
  evidence: 1,
  is_unguided: undefined,
  is_unsettled: undefined,
  outputs: 9,
  payments: 5,
  rivalry: 0.1,
  round_shift: 0,
  stability: 0,
};

// A brief price, as priors and provisional prices are known
const briefPrice = {version, block_id: '00', blocks: [1, 144], cents: 1000000};

// A later provisional price stored by another node sharing the file
const laterPrice = {version, block_id: '01', blocks: [1, 150], cents: 1000100};

// A price of another version of the method
const stalePrice = {cents: 5000000, version: 'old'};

// A full day price that was estimated without a guide
const unguidedPrice = Object.assign({}, dayPrice, {is_unguided: true});

// Prices as they are in the prices file
const asFile = prices => parse(stringify(prices));

// The logs of a provisional or a sample price
const briefLog = overrides => ({
  chain_price: Object.assign({date: day, price: '10000.00'}, overrides),
});

// The prices in a prices file
const makePrices = overrides => Object.assign({
  priors: {},
  provisional: {},
  rates: {},
  version: 2,
},
overrides);

const makeFs = files => ({
  files,
  getFile: (path, cbk) => {
    return !files[path] ? cbk({code: 'ENOENT'}) : cbk(null, files[path]);
  },
  makeDirectory: (path, cbk) => cbk(),
  renameFile: (from, to, cbk) => {
    files[to] = files[from];

    delete files[from];

    return cbk();
  },
  writeFile: (path, contents, cbk) => {
    files[path] = contents;

    return cbk();
  },
});

const makeLogger = () => {
  const logs = [];

  return {logs, info: line => logs.push(line)};
};

const makeEstimates = () => {
  return {priors: {}, provisional: {}, rates: {}, samples: 0};
};

const makeEstimate = overrides => {
  const estimate = {
    version,
    agreement: 0.9,
    block_id: '00',
    blocks: [1, 144],
    cents: 1000000,
    confidence: 1.2,
    date: day,
    dispersion: 0.02,
    evidence: 1,
    outputs: 9,
    payments: 5,
    rivalry: 0.1,
    round_shift: 0,
    stability: 0,
  };

  Object.keys(overrides).forEach(k => estimate[k] = overrides[k]);

  return estimate;
};

const makeArgs = overrides => {
  const args = {
    path,
    estimate: makeEstimate({}),
    estimates: makeEstimates(),
    fs: makeFs({}),
    logger: makeLogger(),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const makeExpected = overrides => {
  const expected = {
    err: undefined,
    estimates: makeEstimates(),
    logs: [],
    prices: undefined,
  };

  Object.keys(overrides).forEach(k => expected[k] = overrides[k]);

  return expected;
};

// Store an estimate, with any error and what is known, stored and logged
const storeEstimate = args => new Promise(resolve => {
  return method(args, err => {
    const file = !args.fs ? undefined : args.fs.files[path];

    return resolve({
      err,
      estimates: args.estimates,
      logs: !args.logger ? undefined : args.logger.logs,
      prices: !file ? undefined : parse(file),
    });
  });
});

const tests = [
  {
    args: makeArgs({estimate: undefined}),
    description: 'An estimate is required',
    expected: makeExpected({
      err: [400, 'ExpectedEstimateToStoreEstimate'],
    }),
  },
  {
    args: makeArgs({estimates: undefined}),
    description: 'Known estimates are required',
    expected: makeExpected({
      err: [400, 'ExpectedKnownEstimatesToStoreEstimate'],
      estimates: undefined,
    }),
  },
  {
    args: makeArgs({fs: undefined}),
    description: 'File system methods are required',
    expected: makeExpected({
      err: [400, 'ExpectedFileSystemMethodsToStoreEstimate'],
    }),
  },
  {
    args: makeArgs({path: undefined}),
    description: 'A prices file path is required',
    expected: makeExpected({
      err: [400, 'ExpectedPricesFilePathToStoreEstimate'],
    }),
  },
  {
    args: makeArgs({estimate: makeEstimate({is_unguided: true})}),
    description: 'A full day estimate without a guide is stored as a start',
    expected: makeExpected({
      estimates: Object.assign(makeEstimates(), {
        rates: {[day]: unguidedPrice},
      }),
      logs: [{chain_price: {starting_from: day}}, dayLog],
      prices: makePrices({rates: asFile({[day]: unguidedPrice})}),
    }),
  },
  {
    args: makeArgs({}),
    description: 'Only a price estimated without a guide is a start',
    expected: makeExpected({
      estimates: Object.assign(makeEstimates(), {rates: {[day]: dayPrice}}),
      logs: [dayLog],
      prices: makePrices({rates: asFile({[day]: dayPrice})}),
    }),
  },
  {
    args: makeArgs({
      estimate: makeEstimate({is_sample: true}),
      estimates: Object.assign(makeEstimates(), {samples: 9}),
    }),
    description: 'Every tenth sample is logged, and is stored as a prior',
    expected: makeExpected({
      estimates: Object.assign(makeEstimates(), {
        priors: {[day]: briefPrice},
        samples: 10,
      }),
      logs: [briefLog({is_sample: true, is_widened: undefined})],
      prices: makePrices({priors: {[day]: briefPrice}}),
    }),
  },
  {
    args: makeArgs({
      estimate: makeEstimate({is_sample: true, is_widened: true}),
    }),
    description: 'A sample outside the expected window is always logged',
    expected: makeExpected({
      estimates: Object.assign(makeEstimates(), {
        priors: {[day]: briefPrice},
        samples: 1,
      }),
      logs: [briefLog({is_sample: true, is_widened: true})],
      prices: makePrices({priors: {[day]: briefPrice}}),
    }),
  },
  {
    args: makeArgs({
      fs: makeFs({
        [path]: stringify({priors: {}, rates: {'2023-12-31': stalePrice}}),
      }),
    }),
    description: 'A price of another version in the file is kept but not used',
    expected: makeExpected({
      estimates: Object.assign(makeEstimates(), {rates: {[day]: dayPrice}}),
      logs: [dayLog],
      prices: makePrices({
        rates: asFile({'2023-12-31': stalePrice, [day]: dayPrice}),
      }),
    }),
  },
  {
    args: makeArgs({estimate: makeEstimate({is_provisional: true})}),
    description: 'A provisional estimate is kept with its blocks',
    expected: makeExpected({
      estimates: Object.assign(makeEstimates(), {
        provisional: {[day]: briefPrice},
      }),
      logs: [briefLog({is_provisional: true, is_widened: undefined})],
      prices: makePrices({provisional: {[day]: briefPrice}}),
    }),
  },
  {
    args: makeArgs({
      fs: Object.assign(makeFs({}), {writeFile: ({}, {}, cbk) => cbk('err')}),
    }),
    description: 'A failed write leaves the known estimates as they were',
    expected: makeExpected({
      err: [503, 'FailedToWritePricesFile', {err: 'err'}],
      logs: [dayLog],
    }),
  },
  {
    args: makeArgs({
      estimate: makeEstimate({is_provisional: true}),
      fs: makeFs({
        [path]: stringify({
          priors: {},
          provisional: {[day]: laterPrice},
          rates: {},
        }),
      }),
    }),
    description: 'A provisional price is kept when the file has a later one',
    expected: makeExpected({
      estimates: Object.assign(makeEstimates(), {
        provisional: {[day]: briefPrice},
      }),
      logs: [briefLog({is_provisional: true, is_widened: undefined})],
      prices: makePrices({provisional: {[day]: laterPrice}}),
    }),
  },
  {
    args: makeArgs({logger: undefined}),
    description: 'Estimates are stored without a logger',
    expected: makeExpected({
      estimates: Object.assign(makeEstimates(), {rates: {[day]: dayPrice}}),
      logs: undefined,
      prices: makePrices({rates: asFile({[day]: dayPrice})}),
    }),
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    deepEqual(await storeEstimate(args), expected, 'Got expected result');

    return;
  });
});
