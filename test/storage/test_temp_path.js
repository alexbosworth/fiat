const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../storage/temp_path');

const path = '/data/prices.json';

// Get two temporary paths for a file, saying where they are and if they differ
const twoPaths = args => {
  const first = method(args).path;
  const second = method(args).path;

  const format = new RegExp(`^${args.path}\\.${process.pid}\\.[0-9a-f]{8}$`);

  return {
    is_next_to_file: format.test(first) && format.test(second),
    is_own_path: first !== second,
  };
};

const tests = [
  {
    args: {path},
    description: 'A temporary path is next to the file and of its own',
    expected: {is_next_to_file: true, is_own_path: true},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(twoPaths(args), expected, 'Got expected paths');

    return;
  });
});
