const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain: makeFixtureChain} = require('./../fixtures');
const {makeStore} = require('./../fixtures');
const method = require('./../../chain/estimates/get_price_for_date');

// Chains start well after the earliest supported day
const genesis = Date.parse('2026-01-01T00:00:00.000Z') / 1000;

const makeChain = args => makeFixtureChain(Object.assign({genesis}, args));

test('Errors fetching blocks while bridging are passed back', async () => {
  const chain = makeChain({});

  const store = makeStore({chain, known: [0]});

  // The blocks of the days in between cannot be fetched
  const lnd = Object.assign({}, chain.lnd, {
    blocks: Object.assign({}, chain.lnd.blocks, {
      getBlock: ({}, cbk) => cbk({details: 'err'}),
    }),
  });

  await rejects(
    method({
      lnd,
      date: chain.day(2),
      get_prices: store.get_prices,
      height: chain.tip,
      put_price: store.put_price,
    }),
    [503, 'UnexpectedErrorWhenGettingChainBlock', {err: {details: 'err'}}],
    'The error fetching a block is passed back'
  );

  deepEqual(store.puts, [], 'Nothing is remembered');

  return;
});
