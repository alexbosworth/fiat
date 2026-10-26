const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain} = require('./../fixtures');
const method = require('./../../chain/blocks/get_block_payments');

const makeArgs = overrides => {
  const args = {height: 1, lnd: makeChain({}).lnd};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({blocks: {}}),
    description: 'Retrieved blocks are expected to be a map',
    error: [400, 'ExpectedBlocksMapToGetBlockPayments'],
  },
  {
    args: makeArgs({height: undefined}),
    description: 'A block height is required',
    error: [400, 'ExpectedBlockHeightToGetBlockPayments'],
  },
  {
    args: makeArgs({height: -1}),
    description: 'A block height is not negative',
    error: [400, 'ExpectedBlockHeightToGetBlockPayments'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToGetBlockPayments'],
  },
];

tests.forEach(({args, description, error}) => {
  return test(description, async () => {
    await rejects(method(args), error, 'Got expected error');

    return;
  });
});

test('The payments of a block are retrieved once', async () => {
  const blocks = new Map();
  const chain = makeChain({});

  const first = await method({blocks, height: 10, lnd: chain.lnd});

  ok(first.outputs.length > 0, 'Payment outputs are returned');
  ok(first.transactions > 0, 'Payment transactions are counted');
  ok(Number.isInteger(first.time), 'The block time is returned');

  const fetched = chain.calls.blocks;

  deepEqual(await method({blocks, height: 10, lnd: chain.lnd}), first);
  deepEqual(chain.calls.blocks, fetched, 'The kept block is not fetched');

  return;
});
