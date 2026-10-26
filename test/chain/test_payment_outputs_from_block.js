const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {numberAsCompactInt} = require('@alexbosworth/blockchain');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const method = require('./../../chain/blocks/payment_outputs_from_block');

const blockHeaderByteLength = 80;
const bufferAsHex = buffer => buffer.toString('hex');
const coinbaseVout = 0xffffffff;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const opReturnScript = '6a0474657374';

const id = n => bufferAsHex(Buffer.alloc(32, n));
const p2wpkh = n => `0014${bufferAsHex(Buffer.alloc(20, n))}`;

const makeTx = ({inputs, outputs}) => {
  return transactionFromComponents({
    inputs: inputs.map(input => ({
      id: input.id,
      script: input.script || '',
      vout: input.vout || 0,
      witness: input.witness,
    })),
    locktime: 0,
    outputs: outputs.map((tokens, i) => ({tokens, script: p2wpkh(i + 1)})),
    version: 2,
  }).transaction;
};

// Make a hex encoded block out of raw transactions
const makeBlock = txs => bufferAsHex(Buffer.concat([
  Buffer.alloc(blockHeaderByteLength),
  numberAsCompactInt({number: txs.length}).encoded,
  ...txs.map(hexAsBuffer),
]));

const coinbase = makeTx({
  inputs: [{id: id(0), script: '03aabbcc', vout: coinbaseVout}],
  outputs: [312500000, 1000000],
});

const payment = makeTx({
  inputs: [{id: id(1), witness: ['30'.repeat(72), '02'.repeat(33)]}],
  outputs: [100000, 2345678],
});

const legacyPayment = makeTx({
  inputs: [{id: id(2), script: `47${'30'.repeat(71)}`}],
  outputs: [546, 7777777],
});

const bigWitness = makeTx({
  inputs: [{id: id(3), witness: ['ab'.repeat(600)]}],
  outputs: [100000, 2345678],
});

const opReturn = transactionFromComponents({
  inputs: [{id: id(4), script: '', vout: 0}],
  locktime: 0,
  outputs: [
    {script: p2wpkh(1), tokens: 50000},
    {script: opReturnScript, tokens: 0},
  ],
  version: 2,
}).transaction;

const threeOutputs = makeTx({
  inputs: [{id: id(5)}],
  outputs: [50000, 60000, 70000],
});

const manyInputs = makeTx({
  inputs: [1, 2, 3, 4, 5, 6].map(n => ({id: id(n), vout: n})),
  outputs: [50000, 60000],
});

const dust = makeTx({inputs: [{id: id(6)}], outputs: [546, 1000]});

const huge = makeTx({inputs: [{id: id(7)}], outputs: [2e13, 1e13]});

const txs = [
  coinbase,
  payment,
  legacyPayment,
  bigWitness,
  opReturn,
  threeOutputs,
  manyInputs,
  dust,
  huge,
];

const tests = [
  {
    args: {},
    description: 'A hex encoded block is required',
    error: 'ExpectedHexEncodedBlockToDerivePaymentOutputs',
  },
  {
    args: {block: bufferAsHex(Buffer.alloc(blockHeaderByteLength))},
    description: 'A block with transactions is required',
    error: 'ExpectedBlockHeaderAndTransactionsToDeriveOutputs',
  },
  {
    args: {block: makeBlock([payment]).slice(0, -10)},
    description: 'A block with complete transactions is required',
    error: 'UnexpectedTransactionLengthInBlockToDeriveOutputs',
  },
  {
    args: {block: `${makeBlock([payment])}00`},
    description: 'A block without extra data is required',
    error: 'UnexpectedDataAfterBlockTransactionsToDeriveOutputs',
  },
  {
    args: {block: makeBlock(txs)},
    description: 'Payment outputs are derived from a block',
    expected: {
      transactions: [{outputs: [100000, 2345678]}, {outputs: [7777777]}],
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, () => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      deepEqual(method(args), expected, 'Got expected result');
    }

    return;
  });
});
