const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../storage/is_prices');

const tests = [
  {
    args: {prices: undefined},
    description: 'Nothing is not a set of prices',
    expected: {is_prices: false},
  },
  {
    args: {prices: []},
    description: 'An array is not a set of prices',
    expected: {is_prices: false},
  },
  {
    args: {prices: {'2024-01-01': 1}},
    description: 'A price has to be an object',
    expected: {is_prices: false},
  },
  {
    args: {prices: {'2024-01-01': null}},
    description: 'A null price is not a price',
    expected: {is_prices: false},
  },
  {
    args: {prices: {'2024-1-1': {cents: 1}}},
    description: 'A price has to be for a YYYY-MM-DD day',
    expected: {is_prices: false},
  },
  {
    args: {prices: {'2024-02-30': {cents: 1}}},
    description: 'A price has to be for a day of the calendar',
    expected: {is_prices: false},
  },
  {
    args: {prices: {'2024-01-01': {cents: 1}, 'junk': {cents: 1}}},
    description: 'Every price has to be for a day',
    expected: {is_prices: false},
  },
  {
    args: {prices: {}},
    description: 'No prices is a set of prices',
    expected: {is_prices: true},
  },
  {
    args: {prices: {'2024-01-01': {cents: 1}}},
    description: 'Prices by day are a set of prices',
    expected: {is_prices: true},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(method(args), expected, 'Got expected result');

    return;
  });
});
