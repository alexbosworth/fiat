const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {blockHeaderHash} = require('./../../chain/blocks');
const {makeChain} = require('./../fixtures');
const method = require('./../../chain/estimates/check_known_estimates');

const bufferAsHex = buffer => buffer.toString('hex');
const chain = makeChain({});

// The hash of a block in the simulated chain
const hashAt = height => {
  const hash = Buffer.alloc(32);

  hash.writeUInt32LE(height, 0);

  return new Promise((resolve, reject) => {
    return chain.lnd.blocks.getBlockHeader({block_hash: hash}, (err, res) => {
      const header = bufferAsHex(res.raw_block_header);

      return resolve(blockHeaderHash({header}).hash);
    });
  });
};

const makeEstimates = overrides => {
  const estimates = {priors: {}, rates: {}};

  Object.keys(overrides).forEach(k => estimates[k] = overrides[k]);

  return estimates;
};

const makeArgs = overrides => {
  const {lnd, tip} = chain;

  const args = {lnd, estimates: makeEstimates({}), height: tip};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({estimates: undefined}),
    description: 'Known estimates are required',
    error: [400, 'ExpectedKnownEstimatesToCheckKnownEstimates'],
  },
  {
    args: makeArgs({height: undefined}),
    description: 'The chain height is required',
    error: [400, 'ExpectedChainHeightToCheckKnownEstimates'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToCheckKnownEstimates'],
  },
  {
    args: makeArgs({
      estimates: makeEstimates({
        rates: {'2024-01-01': {blocks: [0, 148], cents: 1, hash: '00'}},
      }),
      lnd: {
        blocks: {
          getBlockHash: ({}, cbk) => cbk(null, {block_hash: Buffer.alloc(32)}),
          getBlockHeader: ({}, cbk) => cbk({details: 'err'}),
        },
      },
    }),
    description: 'Errors getting block hashes are passed back',
    error: [
      503,
      'UnexpectedErrorWhenGettingBlockHeader',
      {err: {details: 'err'}},
    ],
  },
];

tests.forEach(({args, description, error}) => {
  return test(description, async () => {
    await rejects(method(args), error, 'Got expected error');

    return;
  });
});

test('Known estimates no longer in the chain are removed', async () => {
  const estimates = makeEstimates({
    priors: {
      // A prior whose block is beyond the chain tip is only set aside
      '2024-01-02': {blocks: [149, chain.tip + 1], cents: 1, hash: '00'},

      // A prior that is still in the chain
      '2024-01-03': {blocks: [293, 436], cents: 1, hash: await hashAt(436)},
    },
    provisional: {
      // A provisional price whose block hash does not match the chain
      '2024-01-05': {blocks: [581, 600], cents: 1, hash: '00'},
    },
    rates: {
      // A rate whose block hash does not match the chain
      '2024-01-01': {blocks: [0, 148], cents: 1, hash: '00'},

      // A rate without a hash to check
      '2024-01-04': {blocks: [437, 580], cents: 1},
    },
  });

  const res = await method({estimates, height: chain.tip, lnd: chain.lnd});

  const removed = [
    {day: '2024-01-01', hash: '00'},
    {day: '2024-01-05', hash: '00'},
  ];

  deepEqual(res, {removed}, 'Removed days');

  deepEqual(Object.keys(estimates.priors), ['2024-01-03'], 'Prior set aside');
  deepEqual(estimates.provisional, {}, 'Provisional removed');
  deepEqual(Object.keys(estimates.rates), ['2024-01-04'], 'Rate removed');

  return;
});

test('Estimates beyond the chain tip are set aside, not removed', async () => {
  // A node that is behind the blocks that the estimates were derived from
  const estimates = makeEstimates({
    priors: {
      '2024-01-02': {blocks: [149, chain.tip + 1], cents: 1, hash: '00'},
    },
    provisional: {
      '2024-01-05': {blocks: [581, chain.tip + 9], cents: 1, hash: '00'},
    },
    rates: {
      '2024-01-03': {blocks: [293, 436], cents: 1, hash: await hashAt(436)},
      '2024-01-04': {blocks: [437, chain.tip + 5], cents: 1, hash: '00'},
    },
  });

  const res = await method({estimates, height: chain.tip, lnd: chain.lnd});

  deepEqual(res, {removed: []}, 'Nothing is reported for removal');
  deepEqual(estimates.priors, {}, 'The prior is set aside');
  deepEqual(estimates.provisional, {}, 'The provisional price is set aside');
  deepEqual(Object.keys(estimates.rates), ['2024-01-03'], 'Rate set aside');

  return;
});

test('Estimates from long settled blocks are not checked', async () => {
  const estimates = makeEstimates({
    rates: {'2024-01-01': {blocks: [0, 148], cents: 1, hash: '00'}},
  });

  const res = await method({estimates, height: 148 + 1008, lnd: chain.lnd});

  deepEqual(res, {removed: []}, 'Nothing is removed');

  return;
});
