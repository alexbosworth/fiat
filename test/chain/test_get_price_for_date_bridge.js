const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeChain: makeFixtureChain} = require('./../fixtures');
const {makeStore} = require('./../fixtures');
const method = require('./../../chain/estimates/get_price_for_date');

// Chains start well after the earliest supported day
const genesis = Date.parse('2026-01-01T00:00:00.000Z') / 1000;

const makeChain = args => makeFixtureChain(Object.assign({genesis}, args));

const chain = makeChain({});

// LND that cannot get the blocks of the days in between
const failingLnd = Object.assign({}, chain.lnd, {
  blocks: Object.assign({}, chain.lnd.blocks, {
    getBlock: ({}, cbk) => cbk({details: 'err'}),
  }),
});

const tests = [
  {
    args: {
      date: chain.day(2),
      get_prices: makeStore({chain, known: [0]}).get_prices,
      height: chain.tip,
      lnd: failingLnd,
      put_price: () => {
        throw new Error('UnexpectedPriceRememberedAfterFailure');
      },
    },
    description: 'Errors fetching blocks while bridging are passed back',
    error: [
      503,
      'UnexpectedErrorWhenGettingChainBlock',
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
