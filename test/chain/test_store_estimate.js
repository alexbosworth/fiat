const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../chain/estimates/store_estimate');
const {methodVersion} = require('./../../chain/known');

const path = '/data/prices.json';
const {version} = methodVersion({});

const makeFs = files => ({
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

const makeEstimates = () => {
  return {priors: {}, provisional: {}, rates: {}, samples: 0};
};

const makeEstimate = overrides => {
  const estimate = {
    version,
    agreement: 0.9,
    blocks: [1, 144],
    cents: 1000000,
    confidence: 1.2,
    date: '2024-01-01',
    dispersion: 0.02,
    evidence: 1,
    hash: '00',
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
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({estimate: undefined}),
    description: 'An estimate is required',
    error: [400, 'ExpectedEstimateToStoreEstimate'],
  },
  {
    args: makeArgs({estimates: undefined}),
    description: 'Known estimates are required',
    error: [400, 'ExpectedKnownEstimatesToStoreEstimate'],
  },
  {
    args: makeArgs({fs: undefined}),
    description: 'File system methods are required',
    error: [400, 'ExpectedFileSystemMethodsToStoreEstimate'],
  },
  {
    args: makeArgs({path: undefined}),
    description: 'A prices file path is required',
    error: [400, 'ExpectedPricesFilePathToStoreEstimate'],
  },
];

tests.forEach(({args, description, error}) => {
  return test(description, async () => {
    await rejects(method(args), error, 'Got expected error');

    return;
  });
});

test('A full day estimate is stored in the file and logged', async () => {
  const files = {};
  const logs = [];

  const logger = {info: n => logs.push(n)};

  const args = makeArgs({
    logger,
    estimate: makeEstimate({is_unguided: true}),
    fs: makeFs(files),
  });

  await method(args);

  const stored = {
    '2024-01-01': {
      version,
      agreement: 0.9,
      blocks: [1, 144],
      cents: 1000000,
      confidence: 1.2,
      dispersion: 0.02,
      drift: undefined,
      evidence: 1,
      hash: '00',
      is_unguided: true,
      is_unsettled: undefined,
      outputs: 9,
      payments: 5,
      rivalry: 0.1,
      round_shift: 0,
      stability: 0,
    },
  };

  deepEqual(args.estimates.rates, stored, 'Remembered');
  deepEqual(JSON.parse(files[path]).rates, JSON.parse(JSON.stringify(stored)));
  deepEqual(logs[0], {chain_price: {starting_from: '2024-01-01'}}, 'Start');
  deepEqual(logs[1].chain_price.price, '10000.00', 'Price is logged');
  deepEqual(logs[1].chain_price.payments, 5, 'Payments are logged');
  deepEqual(logs[1].chain_price.confidence, 1.2, 'Confidence is logged');
  deepEqual(logs[1].chain_price.rivalry, 0.1, 'Rivalry is logged');
  deepEqual(logs[1].chain_price.dispersion, 0.02, 'Spread is logged');
  deepEqual(logs[1].chain_price.is_widened, undefined, 'In');

  return;
});

test('Only a price estimated without a guide is a start', async () => {
  const logs = [];

  // Even with no other estimates known, a guided price is not a start
  const args = makeArgs({logger: {info: n => logs.push(n)}});

  await method(args);

  deepEqual(logs.filter(n => !!n.chain_price.starting_from), [], 'No start');

  return;
});

test('A sample estimate is stored as a prior and logged', async () => {
  const files = {};
  const logs = [];

  const args = makeArgs({
    estimate: makeEstimate({is_sample: true}),
    estimates: Object.assign(makeEstimates(), {samples: 9}),
    fs: makeFs(files),
    logger: {info: n => logs.push(n)},
  });

  await method(args);

  const prior = {
    '2024-01-01': {version, blocks: [1, 144], cents: 1000000, hash: '00'},
  };

  deepEqual(args.estimates.priors, prior, 'Prior is remembered');
  deepEqual(JSON.parse(files[path]).priors, prior, 'Prior is stored');
  deepEqual(
    logs,
    [{
      chain_price: {
        date: '2024-01-01',
        is_sample: true,
        is_widened: undefined,
        price: '10000.00',
      },
    }],
    'Every tenth sample is logged'
  );

  return;
});

test('A sample outside the expected window is always logged', async () => {
  const logs = [];

  const args = makeArgs({
    estimate: makeEstimate({is_sample: true, is_widened: true}),
    logger: {info: n => logs.push(n)},
  });

  await method(args);

  deepEqual(logs.length, 1, 'The sample is logged');
  deepEqual(logs[0].chain_price.is_widened, true, 'Flagged');

  return;
});

test('A stale version in the prices file is not used', async () => {
  const files = {};

  const stale = {'2023-12-31': {cents: 5000000, version: 'old'}};

  files[path] = JSON.stringify({priors: {}, rates: stale});

  const args = makeArgs({fs: makeFs(files)});

  await method(args);

  deepEqual(Object.keys(args.estimates.rates), ['2024-01-01'], 'Stale is out');
  deepEqual(JSON.parse(files[path]).rates['2023-12-31'], stale['2023-12-31']);

  return;
});

test('A provisional estimate is kept with its blocks', async () => {
  const files = {};
  const logs = [];

  const args = makeArgs({
    estimate: makeEstimate({is_provisional: true}),
    fs: makeFs(files),
    logger: {info: n => logs.push(n)},
  });

  await method(args);

  const expected = {
    '2024-01-01': {version, blocks: [1, 144], cents: 1000000, hash: '00'},
  };

  deepEqual(args.estimates.provisional, expected, 'Kept with its blocks');
  deepEqual(JSON.parse(files[path]).provisional, expected, 'Written to file');
  deepEqual(JSON.parse(files[path]).rates, {}, 'Not written as a rate');
  deepEqual(logs[0].chain_price.is_provisional, true, 'Logged as provisional');

  return;
});

test('A failed write leaves the known estimates as they were', async () => {
  const files = {};
  const fs = makeFs(files);

  const args = makeArgs({
    fs: Object.assign({}, fs, {writeFile: ({}, {}, cbk) => cbk('err')}),
  });

  await rejects(method(args), [503, 'FailedToWritePricesFile'], 'Not stored');

  deepEqual(args.estimates.rates, {}, 'The estimate is not known yet');

  await method(Object.assign({}, args, {fs}));

  const {rates} = JSON.parse(files[path]);

  deepEqual(Object.keys(args.estimates.rates), ['2024-01-01'], 'Now known');
  deepEqual(Object.keys(rates), ['2024-01-01'], 'And in the file');

  return;
});

test('A provisional price is kept when the file has a later one', async () => {
  const files = {};

  // Another node sharing the file is ahead and stored a later price
  const later = {version, blocks: [1, 150], cents: 1000100, hash: '01'};

  files[path] = JSON.stringify({
    priors: {},
    provisional: {'2024-01-01': later},
    rates: {},
  });

  const args = makeArgs({
    estimate: makeEstimate({is_provisional: true}),
    fs: makeFs(files),
  });

  await method(args);

  const {provisional} = JSON.parse(files[path]);

  deepEqual(provisional['2024-01-01'], later, 'The file keeps the later one');

  deepEqual(
    args.estimates.provisional['2024-01-01'],
    {version, blocks: [1, 144], cents: 1000000, hash: '00'},
    'This node keeps its own to reuse'
  );

  return;
});

test('Estimates are stored without a logger', async () => {
  const files = {};

  await method(makeArgs({fs: makeFs(files)}));

  deepEqual(Object.keys(files), [path], 'File is written');

  return;
});
