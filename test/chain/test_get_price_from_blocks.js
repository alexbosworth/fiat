const {deepEqual} = require('node:assert').strict;
const {isDeepStrictEqual} = require('util');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {idForTransaction} = require('@alexbosworth/blockchain');
const {numberAsCompactInt} = require('@alexbosworth/blockchain');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const method = require('./../../chain/estimates/get_price_from_blocks');

const {abs} = Math;
const blockHeaderByteLength = 80;
const bufferAsHex = buffer => buffer.toString('hex');
const centsPerDollar = 100;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const jitter = 0.002;
const price = 48765;
const tokensPerBigUnit = 1e8;

const p2wpkh = n => `0014${bufferAsHex(Buffer.alloc(20, n % 256))}`;

// Deterministic pseudo random numbers
const makeRandom = seed => () => {
  seed |= 0;
  seed = seed + 0x6D2B79F5 | 0;

  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);

  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;

  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

const makeTx = ({id, outputs}) => {
  return transactionFromComponents({
    inputs: [{id, script: '', vout: 0}],
    locktime: 0,
    outputs: outputs.map((tokens, i) => ({tokens, script: p2wpkh(i + 1)})),
    version: 2,
  }).transaction;
};

// Make a block of payments at a USD price
const makeBlock = ({seed, spends}) => {
  const random = makeRandom(seed);
  const txs = [];

  const usdToTokens = usd => Math.round(usd / price * tokensPerBigUnit);

  for (let i = 0; i < 1200; i++) {
    const id = bufferAsHex(Buffer.alloc(32, (seed * 7 + i) % 256));

    const isSpike = random() < 0.4;

    const spike = [10, 20, 50, 100, 200, 500][i % 6];

    const usd = isSpike ? spike : 30 + random() * 300;

    const change = usdToTokens(30 + random() * 300);

    // A payment is made at a price a little off the price of the day
    const paid = usdToTokens(usd / (1 + jitter * (2 * random() - 1)));

    txs.push(makeTx({id, outputs: [paid, change]}));
  }

  // Add transactions that spend outputs from within the window
  const outputs = [12345, 54321];

  (spends || []).forEach(id => txs.push(makeTx({id, outputs})));

  const block = Buffer.concat([
    Buffer.alloc(blockHeaderByteLength),
    numberAsCompactInt({number: txs.length}).encoded,
    ...txs.map(hexAsBuffer),
  ]);

  return {
    block: bufferAsHex(block),
    ids: txs.map(tx => idForTransaction({transaction: tx}).id),
  };
};

const first = makeBlock({seed: 1});

const second = makeBlock({seed: 2, spends: [first.ids[0], first.ids[1]]});

const blocks = {100: first.block, 101: second.block};

// A mock LND that serves the blocks
const makeLnd = overrides => {
  const lnd = {
    blocks: {
      getBlock: (args, cbk) => {
        const block = blocks[args.block_hash.readUInt32LE(0)];

        return cbk(null, {raw_block: hexAsBuffer(block)});
      },
      getBlockHash: (args, cbk) => {
        const hash = Buffer.alloc(32);

        hash.writeUInt32LE(args.block_height, 0);

        return cbk(null, {block_hash: hash});
      },
    },
  };

  Object.keys(overrides).forEach(k => lnd.blocks[k] = overrides[k]);

  return lnd;
};

// A price derived from blocks, measured against the price of the payments
const priceOf = async args => {
  const res = await method(args);

  const cents = price * centsPerDollar;

  return {
    drift: res.drift,
    is_agreeing: res.agreement > 0.5,
    is_beating_aliases: res.confidence > 1,
    is_covered: res.coverage > 0,
    is_derived: abs(res.cents / cents - 1) < 0.005,
    is_observable: res.evidence > 0.9,
    is_outputs_counted: res.outputs >= res.transactions,
    is_payments_counted: res.payments > 0,
    is_rivalry_measured: res.rivalry < 0.9,
    is_rough_close: abs(res.rough_cents / cents - 1) < 0.02,
    is_round_steady: res.round_shift < 0.01,
    is_significant: res.significance > 4,
    is_spread_tight: res.dispersion >= 0 && res.dispersion < 0.01,
    is_stable: res.stability < 0.01,
    is_widened: res.is_widened,
    transactions: res.transactions,
  };
};

// Get a price from blocks twice, the second time from the blocks kept from
// the first time, with the blocks that were fetched and kept
const priceTwice = async args => {
  const fetched = [];

  const lnd = makeLnd({
    getBlock: (req, cbk) => {
      const height = req.block_hash.readUInt32LE(0);

      fetched.push(height);

      return cbk(null, {raw_block: hexAsBuffer(blocks[height])});
    },
  });

  const first = await method(Object.assign({}, args, {lnd}));

  const again = await method(Object.assign({}, args, {
    lnd,
    heights: args.heights.slice().reverse(),
  }));

  const kept = args.blocks.get(args.heights[0]);

  return {
    fetched: fetched.slice().sort(),
    is_kept_outputs: kept.outputs.length > 1000,
    is_kept_transactions: kept.transactions > 1000,
    is_same_again: isDeepStrictEqual(first, again),
    kept: [...args.blocks.keys()].sort(),
    kept_time: kept.time,
  };
};

const makeArgs = overrides => {
  const args = {heights: [100, 101], lnd: makeLnd({})};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const makeExpected = overrides => {
  const expected = {
    drift: undefined,
    is_agreeing: true,
    is_beating_aliases: true,
    is_covered: true,
    is_derived: true,
    is_observable: true,
    is_outputs_counted: true,
    is_payments_counted: true,
    is_rivalry_measured: true,
    is_rough_close: true,
    is_round_steady: true,
    is_significant: true,
    is_spread_tight: true,
    is_stable: true,
    is_widened: undefined,
    transactions: 2402,
  };

  Object.keys(overrides).forEach(k => expected[k] = overrides[k]);

  return expected;
};

const tests = [
  {
    args: makeArgs({heights: undefined}),
    description: 'Block heights are required',
    error: [400, 'ExpectedBlockHeightsToGetPriceFromBlocks'],
  },
  {
    args: makeArgs({heights: []}),
    description: 'Some block heights are required',
    error: [400, 'ExpectedBlockHeightsToGetPriceFromBlocks'],
  },
  {
    args: makeArgs({heights: ['height']}),
    description: 'Numeric block heights are required',
    error: [400, 'ExpectedBlockHeightNumbersToGetPriceFromBlocks'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is required',
    error: [400, 'ExpectedAuthenticatedLndToGetPriceFromBlocks'],
  },
  {
    args: makeArgs({
      lnd: makeLnd({getBlock: ({}, cbk) => cbk({details: 'err'})}),
    }),
    description: 'Errors getting blocks are passed back',
    error: [
      503,
      'UnexpectedErrorWhenGettingChainBlock',
      {err: {details: 'err'}},
    ],
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        getBlock: ({}, cbk) => cbk(null, {raw_block: Buffer.alloc(90)}),
      }),
    }),
    description: 'Errors parsing blocks are passed back',
    error: [503, 'FailedToParseBlockToGetPrice'],
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        getBlock: ({}, cbk) => cbk(null, {
          raw_block: Buffer.concat([
            Buffer.alloc(blockHeaderByteLength),
            numberAsCompactInt({number: 1}).encoded,
            hexAsBuffer(makeTx({id: first.ids[0], outputs: [546]})),
          ]),
        }),
      }),
    }),
    description: 'Payment outputs are required to derive a price',
    error: [503, 'ExpectedPaymentOutputsInBlocksToGetPrice'],
  },
  {
    args: makeArgs({max_price: 1, min_price: 2}),
    description: 'Errors deriving the price are passed back',
    error: [503, 'FailedToDerivePriceFromOutputs'],
  },
  {
    args: makeArgs({}),
    description: 'The price is derived from the payments in blocks',
    expected: makeExpected({}),
    subject: priceOf,
  },
  {
    args: makeArgs({max_price: 60000, min_price: 40000}),
    description: 'The price is derived from the payments within a window',
    expected: makeExpected({}),
    subject: priceOf,
  },
  {
    args: makeArgs({max_price: 40000, min_price: 30000}),
    description: 'A window that misses the price is widened to find it',
    expected: makeExpected({is_widened: true}),
    subject: priceOf,
  },
  {
    args: makeArgs({max_price: 30000, min_price: 20000}),
    description: 'A window around an alias is widened to find the price',
    expected: makeExpected({is_widened: true}),
    subject: priceOf,
  },
  {
    args: makeArgs({blocks: new Map()}),
    description: 'Blocks kept in a map are not retrieved again',
    expected: {
      fetched: [100, 101],
      is_kept_outputs: true,
      is_kept_transactions: true,
      is_same_again: true,
      kept: [100, 101],
      kept_time: 0,
    },
    subject: priceTwice,
  },
];

tests.forEach(({args, description, error, expected, subject}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      deepEqual(await subject(args), expected, 'Got expected result');
    }

    return;
  });
});
