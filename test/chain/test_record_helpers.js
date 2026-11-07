const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const blockHeaderId = require('./../../chain/blocks/block_header_id');
const {currentEstimates} = require('./../../chain/estimates');
const {estimateRecord} = require('./../../chain/estimates');
const {isAliasRatio} = require('./../../chain/estimates');
const {isSupportedEstimate} = require('./../../chain/estimates');
const {methodVersion} = require('./../../chain/known');

const {version} = methodVersion({});

// The genesis block header
const genesisHeader = [
  '0100000000000000000000000000000000000000000000000000000000000000',
  '000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa',
  '4b1e5e4a29ab5f49ffff001d1dac2b7c',
].join('');

const genesisId = [
  '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
].join('');

// An estimate of a price
const estimate = {
  agreement: 0.9,
  block_id: '00',
  blocks: [1, 2],
  cents: 100,
  confidence: 1.2,
  coverage: 0.8,
  outputs: 10,
  payments: 5,
  significance: 6,
  spikes: [],
  spread: 0.01,
};

// Spikes of an estimate that are strong enough to support it
const spikes = [1, 0.5, 0.3, 0.1].map(strength => ({strength, usd: 1}));

// The parts of a record of an estimate that say what kind of estimate it is
const recordOf = args => {
  const {record} = estimateRecord(args);

  return {
    date: record.date,
    is_sample: record.is_sample,
    is_widened: record.is_widened,
    version: record.version,
  };
};

// Whether the version is a number and a hash of the template
const versionOf = args => ({
  is_versioned: /^\d+\.[0-9a-f]{8}$/.test(methodVersion(args).version),
});

const makeSupportArgs = overrides => {
  const args = {
    spikes,
    confidence: 1.05,
    evidence: 1,
    payments: 500,
    rivalry: 0.1,
    significance: 10,
    stability: 0.001,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: {header: genesisHeader},
    description: 'The id of a block is derived from its header',
    expected: {id: genesisId},
    method: blockHeaderId,
  },
  {
    args: {header: '00'},
    description: 'A full header is required to derive the id of a block',
    error: 'ExpectedRawBlockHeaderHexStringToGetBlockId',
    method: blockHeaderId,
  },
  {
    args: {},
    description: 'The method version includes the template',
    expected: {is_versioned: true},
    method: versionOf,
  },
  {
    args: {
      priors: {
        '2024-01-01': {version, cents: 1e6},
        '2024-01-02': {cents: 2e6, version: 'old'},
      },
      provisional: {
        '2024-01-06': {version, blocks: [1, 2], cents: 5e6},
        '2024-01-07': {blocks: [1, 2], cents: 6e6, version: 'old'},
      },
      rates: {
        '2024-01-03': {version, cents: 3e6},
        '2024-01-04': {cents: 4e6},
        '2024-01-05': {cents: 1},
      },
    },
    description: 'Other versions and impossible prices are left out',
    expected: {
      priors: {'2024-01-01': {version, cents: 1e6}},
      provisional: {'2024-01-06': {version, blocks: [1, 2], cents: 5e6}},
      rates: {'2024-01-03': {version, cents: 3e6}},
    },
    method: currentEstimates,
  },
  {
    args: {
      rates: {
        '2024-01-03': {version, cents: 3e6},
        '2024-02-30': {version, cents: 3e6},
        '2024-01-04': null,
        'day': {version, cents: 3e6},
      },
    },
    description: 'Entries that are not estimates for days are left out',
    expected: {
      priors: {},
      provisional: {},
      rates: {'2024-01-03': {version, cents: 3e6}},
    },
    method: currentEstimates,
  },
  {
    args: {
      provisional: {
        '2024-01-03': {version, blocks: [1, 2], cents: 3e6},
        '2024-01-04': {version, cents: 3e6},
        '2024-01-05': {version, blocks: 'blocks', cents: 3e6},
      },
      rates: {
        '2024-01-06': {version, cents: 3e6},
        '2024-01-07': {version, blocks: [2, 1], cents: 3e6},
        '2024-01-08': {version, blocks: [1, -2], cents: 3e6},
      },
    },
    description: 'Estimates without a sound block range when needed are out',
    expected: {
      priors: {},
      provisional: {'2024-01-03': {version, blocks: [1, 2], cents: 3e6}},
      rates: {'2024-01-06': {version, cents: 3e6}},
    },
    method: currentEstimates,
  },
  {
    args: {},
    description: 'Missing estimates are empty',
    expected: {priors: {}, provisional: {}, rates: {}},
    method: currentEstimates,
  },
  {
    args: {estimate, date: '2024-01-01'},
    description: 'A record of an estimate carries the version',
    expected: {
      version,
      date: '2024-01-01',
      is_sample: undefined,
      is_widened: undefined,
    },
    method: recordOf,
  },
  {
    args: {
      date: '2024-01-01',
      estimate: Object.assign({}, estimate, {is_widened: true}),
      is_sample: true,
    },
    description: 'A record of a widened sample estimate says so',
    expected: {
      version,
      date: '2024-01-01',
      is_sample: true,
      is_widened: true,
    },
    method: recordOf,
  },
  {
    args: makeSupportArgs({}),
    description: 'A windowed estimate that beats its aliases is supported',
    expected: {is_supported: true},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({confidence: 0.99}),
    description: 'An estimate that an alias beats is not supported',
    expected: {is_supported: false},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({is_unconstrained: true}),
    description: 'An unconstrained estimate needs a clear margin',
    expected: {is_supported: false},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({confidence: 1.1, is_unconstrained: true}),
    description: 'An unconstrained estimate with a clear margin is supported',
    expected: {is_supported: true},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({payments: 99}),
    description: 'An estimate from too few payments is not supported',
    expected: {is_supported: false},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({significance: 3}),
    description: 'An estimate from an insignificant peak is not supported',
    expected: {is_supported: false},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({payments: undefined}),
    description: 'Payments are required for support',
    expected: {is_supported: false},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({spikes: spikes.slice(0, 2)}),
    description: 'An estimate with few spikes is not supported',
    expected: {is_supported: false},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({spikes: undefined}),
    description: 'Spikes are required for support',
    expected: {is_supported: false},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({rivalry: 0.95}),
    description: 'An estimate that a rival position fits is not supported',
    expected: {is_supported: false},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({rivalry: undefined}),
    description: 'Rivalry is required for support',
    expected: {is_supported: false},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({stability: 0.02}),
    description: 'An estimate whose refinement is unstable is not supported',
    expected: {is_supported: false},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({stability: undefined}),
    description: 'Stability is required for support',
    expected: {is_supported: false},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({evidence: 0.4}),
    description: 'An estimate with too little observable is not supported',
    expected: {is_supported: false},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({evidence: undefined}),
    description: 'Evidence is required for support',
    expected: {is_supported: false},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({
      confidence: 1.15,
      evidence: 0.5,
      is_unconstrained: true,
    }),
    description: 'Less evidence demands a larger clear margin',
    expected: {is_supported: false},
    method: isSupportedEstimate,
  },
  {
    args: makeSupportArgs({
      confidence: 1.25,
      evidence: 0.5,
      is_unconstrained: true,
    }),
    description: 'The larger margin that less evidence demands is met',
    expected: {is_supported: true},
    method: isSupportedEstimate,
  },
  {
    args: {cents: 100, other: 201},
    description: 'Double is an alias ratio',
    expected: {is_alias: true},
    method: isAliasRatio,
  },
  {
    args: {cents: 200, other: 99},
    description: 'Half is an alias ratio',
    expected: {is_alias: true},
    method: isAliasRatio,
  },
  {
    args: {cents: 100, other: 500},
    description: 'Five times is an alias ratio',
    expected: {is_alias: true},
    method: isAliasRatio,
  },
  {
    args: {cents: 100, other: 1000},
    description: 'Ten times is an alias ratio',
    expected: {is_alias: true},
    method: isAliasRatio,
  },
  {
    args: {cents: 100, other: 250},
    description: 'Two and a half times is an alias ratio',
    expected: {is_alias: true},
    method: isAliasRatio,
  },
  {
    args: {cents: 100, other: 103},
    description: 'A small move is not an alias ratio',
    expected: {is_alias: false},
    method: isAliasRatio,
  },
  {
    args: {cents: 100, other: 150},
    description: 'Weak aliases below two do not count',
    expected: {is_alias: false},
    method: isAliasRatio,
  },
  {
    args: {cents: 100, other: 170},
    description: 'An odd ratio is not an alias ratio',
    expected: {is_alias: false},
    method: isAliasRatio,
  },
];

tests.forEach(({args, description, error, expected, method}) => {
  return test(description, () => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      deepEqual(method(args), expected, 'Got expected result');
    }

    return;
  });
});
