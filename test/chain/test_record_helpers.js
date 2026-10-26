const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {blockHeaderHash} = require('./../../chain/blocks');
const {currentEstimates} = require('./../../chain/estimates');
const {estimateRecord} = require('./../../chain/estimates');
const {isAliasRatio} = require('./../../chain/estimates');
const {isSupportedEstimate} = require('./../../chain/estimates');
const {methodVersion} = require('./../../chain/known');

// The genesis block header
const genesisHeader = [
  '0100000000000000000000000000000000000000000000000000000000000000',
  '000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa',
  '4b1e5e4a29ab5f49ffff001d1dac2b7c',
].join('');

const genesisHash = [
  '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
].join('');

test('The hash of a block is derived from its header', () => {
  deepEqual(blockHeaderHash({header: genesisHeader}), {hash: genesisHash});

  throws(
    () => blockHeaderHash({header: '00'}),
    new Error('ExpectedRawBlockHeaderHexStringToGetBlockHeaderHash'),
    'A full header is required'
  );

  return;
});

test('The method version includes the template', () => {
  const {version} = methodVersion({});

  ok(/^\d+\.[0-9a-f]{8}$/.test(version), 'Version is a number and a hash');

  return;
});

test('Only estimates from the current method version are kept', () => {
  const {version} = methodVersion({});

  deepEqual(
    currentEstimates({
      priors: {
        '2024-01-01': {cents: 1e6, version},
        '2024-01-02': {cents: 2e6, version: 'old'},
      },
      provisional: {
        '2024-01-06': {version, blocks: [1, 2], cents: 5e6},
        '2024-01-07': {blocks: [1, 2], cents: 6e6, version: 'old'},
      },
      rates: {
        '2024-01-03': {cents: 3e6, version},
        '2024-01-04': {cents: 4e6},
        '2024-01-05': {cents: 1},
      },
    }),
    {
      priors: {'2024-01-01': {cents: 1e6, version}},
      provisional: {'2024-01-06': {version, blocks: [1, 2], cents: 5e6}},
      rates: {'2024-01-03': {cents: 3e6, version}},
    },
    'Other versions and impossible prices are left out'
  );

  deepEqual(
    currentEstimates({
      rates: {
        '2024-01-03': {cents: 3e6, version},
        '2024-02-30': {cents: 3e6, version},
        '2024-01-04': null,
        'day': {cents: 3e6, version},
      },
    }),
    {
      priors: {},
      provisional: {},
      rates: {'2024-01-03': {cents: 3e6, version}},
    },
    'Entries that are not estimates for a day of the calendar are left out'
  );

  deepEqual(
    currentEstimates({
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
    }),
    {
      priors: {},
      provisional: {'2024-01-03': {version, blocks: [1, 2], cents: 3e6}},
      rates: {'2024-01-06': {version, cents: 3e6}},
    },
    'A damaged block range, or a provisional price without one, is left out'
  );

  const empty = {priors: {}, provisional: {}, rates: {}};

  deepEqual(currentEstimates({}), empty, 'Missing is empty');

  return;
});

test('A record of an estimate carries the version', () => {
  const estimate = {
    agreement: 0.9,
    blocks: [1, 2],
    cents: 100,
    confidence: 1.2,
    coverage: 0.8,
    hash: '00',
    outputs: 10,
    payments: 5,
    significance: 6,
    spikes: [],
    spread: 0.01,
  };

  const {record} = estimateRecord({estimate, date: '2024-01-01'});

  deepEqual(record.version, methodVersion({}).version, 'Version is recorded');
  deepEqual(record.date, '2024-01-01', 'Date is recorded');
  deepEqual(record.is_sample, undefined, 'Not a sample');
  deepEqual(record.is_widened, undefined, 'Not widened');

  const sample = estimateRecord({
    date: '2024-01-01',
    estimate: Object.assign({}, estimate, {is_widened: true}),
    is_sample: true,
  });

  deepEqual(sample.record.is_sample, true, 'Sample is recorded');
  deepEqual(sample.record.is_widened, true, 'Widened is recorded');

  return;
});

test('Estimates are supported when the data supports them', () => {
  const spikes = [1, 0.5, 0.3, 0.1].map(strength => ({strength, usd: 1}));

  const supported = {
    spikes,
    confidence: 1.05,
    evidence: 1,
    payments: 500,
    rivalry: 0.1,
    significance: 10,
    stability: 0.001,
  };

  const isSupported = overrides => {
    const args = Object.assign({}, supported, overrides);

    return isSupportedEstimate(args).is_supported;
  };

  deepEqual(isSupported({}), true, 'A windowed estimate beats its aliases');
  deepEqual(isSupported({confidence: 0.99}), false, 'An alias beat it');
  deepEqual(isSupported({is_unconstrained: true}), false, 'No clear margin');
  deepEqual(isSupported({confidence: 1.1, is_unconstrained: true}), true);
  deepEqual(isSupported({payments: 99}), false, 'Too few payments');
  deepEqual(isSupported({significance: 3}), false, 'Peak is not significant');
  deepEqual(isSupported({payments: undefined}), false, 'Payments required');
  deepEqual(isSupported({spikes: spikes.slice(0, 2)}), false, 'Few spikes');
  deepEqual(isSupported({spikes: undefined}), false, 'Spikes are required');
  deepEqual(isSupported({rivalry: 0.95}), false, 'A rival position fits');
  deepEqual(isSupported({rivalry: undefined}), false, 'Rivalry is required');
  deepEqual(isSupported({stability: 0.02}), false, 'Refinement is unstable');
  deepEqual(isSupported({stability: undefined}), false, 'Stability required');
  deepEqual(isSupported({evidence: 0.4}), false, 'Too little is observable');
  deepEqual(isSupported({evidence: undefined}), false, 'Evidence is required');
  deepEqual(
    isSupported({confidence: 1.15, evidence: 0.5, is_unconstrained: true}),
    false,
    'Less evidence demands a larger clear margin'
  );
  deepEqual(
    isSupported({confidence: 1.25, evidence: 0.5, is_unconstrained: true}),
    true,
    'The larger margin is met'
  );

  return;
});

test('Prices at an alias ratio are recognized', () => {
  const isAlias = (cents, other) => isAliasRatio({cents, other}).is_alias;

  deepEqual(isAlias(100, 201), true, 'Double is an alias ratio');
  deepEqual(isAlias(200, 99), true, 'Half is an alias ratio');
  deepEqual(isAlias(100, 500), true, 'Five times is an alias ratio');
  deepEqual(isAlias(100, 1000), true, 'Ten times is an alias ratio');
  deepEqual(isAlias(100, 250), true, 'Two and a half times is an alias ratio');
  deepEqual(isAlias(100, 103), false, 'A small move is not an alias ratio');
  deepEqual(isAlias(100, 150), false, 'Weak aliases below two do not count');
  deepEqual(isAlias(100, 170), false, 'An odd ratio is not an alias ratio');

  return;
});
