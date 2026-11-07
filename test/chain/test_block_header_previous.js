const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../chain/blocks/block_header_previous');

const bufferAsHex = buffer => buffer.toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const previousOffset = 4;

// The genesis block header, which has no block before it
const genesisHeader = [
  '0100000000000000000000000000000000000000000000000000000000000000',
  '000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa',
  '4b1e5e4a29ab5f49ffff001d1dac2b7c',
].join('');

const genesisId = [
  '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
].join('');

// A header of the block after the genesis block
const nextHeader = () => {
  const header = Buffer.alloc(80);

  hexAsBuffer(genesisId).reverse().copy(header, previousOffset);

  return bufferAsHex(header);
};

const tests = [
  {
    args: {header: genesisHeader},
    description: 'The genesis block has no block before it',
    expected: {previous: bufferAsHex(Buffer.alloc(32))},
  },
  {
    args: {header: nextHeader()},
    description: 'A header has the id of the block before it',
    expected: {previous: genesisId},
  },
  {
    args: {header: `${nextHeader()}00`},
    description: 'A whole block has the id of the block before it',
    expected: {previous: genesisId},
  },
  {
    args: {header: '00'},
    description: 'A header is required',
    error: 'ExpectedRawBlockHeaderHexStringToGetPreviousBlockId',
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
