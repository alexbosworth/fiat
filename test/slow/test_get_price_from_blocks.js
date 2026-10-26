const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {idForTransaction} = require('@alexbosworth/blockchain');
const {numberAsCompactInt} = require('@alexbosworth/blockchain');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const method = require('./../../chain/estimates/get_price_from_blocks');

const blockHeaderByteLength = 80;
const bufferAsHex = buffer => buffer.toString('hex');
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

test('Fetching progress is logged like a progress bar', async () => {
  const logs = [];

  // A mock LND that serves the same block for every height
  const block = hexAsBuffer(first.block);

  const lnd = makeLnd({getBlock: ({}, cbk) => cbk(null, {raw_block: block})});

  const heights = [...Array(48).keys()].map(i => 100 + i);

  const logger = {info: n => logs.push(n)};

  await method({heights, lnd, logger, date: '2024-01-02'});

  deepEqual(logs, [
    {fetching_blocks: {date: '2024-01-02', blocks: '0/48'}},
    {fetching_blocks: {date: '2024-01-02', blocks: '24/48'}},
    {fetching_blocks: {date: '2024-01-02', blocks: '48/48'}},
  ],
  'Progress is logged at the start, every two dozen blocks and at the end');

  const short = [];

  await method({
    lnd,
    heights: heights.slice(0, 12),
    logger: {info: n => short.push(n)},
  });

  deepEqual(short, [], 'A short fetch is not worth logging progress for');

  return;
});
