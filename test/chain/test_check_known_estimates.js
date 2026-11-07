const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const blockHeaderId = require('./../../chain/blocks/block_header_id');
const {makeChain} = require('./../fixtures');
const method = require('./../../chain/estimates/check_known_estimates');

const bufferAsHex = buffer => buffer.toString('hex');
const chain = makeChain({});

// The id of a block in the simulated chain, which answers right away
const idAt = height => {
  const hash = Buffer.alloc(32);
  const ids = [];

  hash.writeUInt32LE(height, 0);

  chain.lnd.blocks.getBlockHeader({block_hash: hash}, (err, res) => {
    const header = bufferAsHex(res.raw_block_header);

    return ids.push(blockHeaderId({header}).id);
  });

  return ids[0];
};

// Estimates of days from blocks in, beyond, and replaced in the chain
const beyond = {block_id: '00', blocks: [149, chain.tip + 1], cents: 1};
const inChain = {block_id: idAt(436), blocks: [293, 436], cents: 1};
const replaced = {block_id: '00', blocks: [0, 148], cents: 1};
const replacedProvisional = {block_id: '00', blocks: [581, 600], cents: 1};
const unchecked = {blocks: [437, 580], cents: 1};

// Estimates from blocks beyond the tip, as when a node is behind
const beyondRate = {block_id: '00', blocks: [437, chain.tip + 5], cents: 1};

const beyondProvisional = {
  block_id: '00',
  blocks: [581, chain.tip + 9],
  cents: 1,
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
        rates: {'2024-01-01': {block_id: '00', blocks: [0, 148], cents: 1}},
      }),
      lnd: {
        blocks: {
          getBlockHash: ({}, cbk) => cbk(null, {block_hash: Buffer.alloc(32)}),
          getBlockHeader: ({}, cbk) => cbk({details: 'err'}),
        },
      },
    }),
    description: 'Errors getting block ids are passed back',
    error: [
      503,
      'UnexpectedErrorWhenGettingBlockHeader',
      {err: {details: 'err'}},
    ],
  },
  {
    args: makeArgs({
      estimates: makeEstimates({
        priors: {'2024-01-02': beyond, '2024-01-03': inChain},
        provisional: {'2024-01-05': replacedProvisional},
        rates: {'2024-01-01': replaced, '2024-01-04': unchecked},
      }),
    }),
    description: 'Known estimates no longer in the chain are removed',
    expected: {
      estimates: {
        priors: {'2024-01-03': inChain},
        provisional: {},
        rates: {'2024-01-04': unchecked},
      },
      removed: [
        {block_id: '00', day: '2024-01-01'},
        {block_id: '00', day: '2024-01-05'},
      ],
    },
  },
  {
    args: makeArgs({
      estimates: makeEstimates({
        priors: {'2024-01-02': beyond},
        provisional: {'2024-01-05': beyondProvisional},
        rates: {'2024-01-03': inChain, '2024-01-04': beyondRate},
      }),
    }),
    description: 'Estimates beyond the chain tip are set aside, not removed',
    expected: {
      estimates: {priors: {}, provisional: {}, rates: {'2024-01-03': inChain}},
      removed: [],
    },
  },
  {
    args: makeArgs({
      estimates: makeEstimates({rates: {'2024-01-01': replaced}}),
      height: 148 + 1008,
    }),
    description: 'Estimates from long settled blocks are not checked',
    expected: {
      estimates: {priors: {}, rates: {'2024-01-01': replaced}},
      removed: [],
    },
  },
];

// Check the known estimates, with what is known of them after
const checkEstimates = async args => {
  const {removed} = await method(args);

  return {removed, estimates: args.estimates};
};

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await checkEstimates(args), expected, 'Got expected check');
    }

    return;
  });
});
