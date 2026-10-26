const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const bufferAsHex = buffer => buffer.toString('hex');

const method = require('./../../chain/blocks/block_header_time');

const header = Buffer.alloc(80);

header.writeUInt32LE(1700000000, 68);

const tests = [
  {
    args: {header: '00'},
    description: 'A full header is required',
    error: 'ExpectedRawBlockHeaderHexStringToGetBlockHeaderTime',
  },
  {
    args: {header: bufferAsHex(header)},
    description: 'The time is read from the header',
    expected: {time: 1700000000},
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
