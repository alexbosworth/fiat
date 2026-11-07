const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../chain/estimates/keep_fetched_block');

const floor = 100;

// One block short of the count of new blocks that asks for a save
const pending = [...Array(23).keys()].map(n => n + floor);

// Kept blocks where asking for a save is an error that surfaces the request
const makeKept = ({}) => ({
  floor,
  blocks: new Map([99, ...pending, 123, 124].map(height => [height, {}])),
  fetched: new Set(pending),
  saved: new Set([124]),
  saves: {
    push: () => {
      throw new Error('SaveOfKeptBlocksRequested');
    },
  },
});

const makeArgs = overrides => {
  const args = {height: 123, kept: makeKept({})};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({kept: undefined}),
    description: 'Nothing is counted when blocks are not kept',
    expected: undefined,
  },
  {
    args: makeArgs({kept: {}}),
    description: 'Nothing is counted when kept blocks are not saved',
    expected: undefined,
  },
  {
    args: makeArgs({height: 99}),
    description: 'A block below the floor of recent blocks is not counted',
    expected: undefined,
  },
  {
    args: makeArgs({height: 125}),
    description: 'A block that is not kept is not counted',
    expected: undefined,
  },
  {
    args: makeArgs({height: 124}),
    description: 'A block that is in the blocks file is not counted',
    expected: undefined,
  },
  {
    args: makeArgs({height: floor}),
    description: 'A block that was already counted is not counted again',
    expected: undefined,
  },
  {
    args: makeArgs({}),
    description: 'A save is asked for every so many new blocks',
    error: 'SaveOfKeptBlocksRequested',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      deepEqual(method(args), expected, 'Got expected result');
    }

    return end();
  });
});
