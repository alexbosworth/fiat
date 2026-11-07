const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../storage/is_kept_block');

const bufferAsHex = buffer => buffer.toString('hex');

const makeArgs = overrides => ({
  block: Object.assign({
    height: 100,
    id: bufferAsHex(Buffer.alloc(32, 1)),
    outputs: [1000, 2000],
    previous: bufferAsHex(Buffer.alloc(32)),
    time: 1700000000,
    transactions: 1,
  },
  overrides),
});

const tests = [
  {
    args: {block: undefined},
    description: 'Nothing is not a kept block',
    expected: {is_kept_block: false},
  },
  {
    args: makeArgs({}),
    description: 'A block with its ids, outputs and time is a kept block',
    expected: {is_kept_block: true},
  },
  {
    args: makeArgs({id: 'id'}),
    description: 'A kept block has an id',
    expected: {is_kept_block: false},
  },
  {
    args: makeArgs({previous: undefined}),
    description: 'A kept block has the id of the block before it',
    expected: {is_kept_block: false},
  },
  {
    args: makeArgs({outputs: {}}),
    description: 'A kept block has a list of outputs',
    expected: {is_kept_block: false},
  },
  {
    args: makeArgs({outputs: [0]}),
    description: 'A kept block has outputs with values',
    expected: {is_kept_block: false},
  },
  {
    args: makeArgs({height: -1}),
    description: 'A kept block has a height',
    expected: {is_kept_block: false},
  },
  {
    args: makeArgs({time: 1.5}),
    description: 'A kept block has a time',
    expected: {is_kept_block: false},
  },
  {
    args: makeArgs({transactions: undefined}),
    description: 'A kept block has a count of transactions',
    expected: {is_kept_block: false},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(method(args), expected, 'Got expected result');

    return;
  });
});
