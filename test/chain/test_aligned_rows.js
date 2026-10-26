const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../scripts/aligned_rows');

const tests = [
  {
    args: {rows: []},
    description: 'No rows give no lines',
    expected: {lines: []},
  },
  {
    args: {rows: [['Date', 'Price'], ['2024-01-01', '1.00'], ['x', ' ']]},
    description: 'Cells are padded to the widest cell of their column',
    expected: {lines: ['Date        Price', '2024-01-01  1.00', 'x']},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(method(args), expected, 'Got expected lines');

    return;
  });
});
