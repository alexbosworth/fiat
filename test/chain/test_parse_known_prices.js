const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../chain/known/parse_known_prices');

const {stringify} = JSON;

const tests = [
  {
    args: {text: undefined},
    description: 'Text is required',
    error: 'ExpectedTextToParseKnownPrices',
  },
  {
    args: {text: '3.abc 2025-10-20\n100\n'},
    description: 'The text is JSON',
    error: 'ExpectedJsonObjectToParseKnownPrices',
  },
  {
    args: {text: stringify([100])},
    description: 'The JSON is an object',
    error: 'ExpectedJsonObjectToParseKnownPrices',
  },
  {
    args: {text: stringify({prices: {}})},
    description: 'A method version is required',
    error: 'ExpectedMethodVersionToParseKnownPrices',
  },
  {
    args: {text: stringify({version: '3.abc'})},
    description: 'Prices are required',
    error: 'ExpectedPricesByDayToParseKnownPrices',
  },
  {
    args: {text: stringify({prices: {'2025-02-30': 100}, version: '3.abc'})},
    description: 'Prices are for days of the calendar',
    error: 'ExpectedPricesByDayToParseKnownPrices',
  },
  {
    args: {text: stringify({prices: {'2025-10-20': 100.5}, version: '3.abc'})},
    description: 'Prices are whole cents',
    error: 'ExpectedPriceInCentsToParseKnownPrices',
  },
  {
    args: {text: stringify({prices: {'2025-10-20': 0}, version: '3.abc'})},
    description: 'Prices are above zero',
    error: 'ExpectedPriceInCentsToParseKnownPrices',
  },
  {
    args: {text: stringify({prices: {'2025-10-20': '100'}, version: '3.abc'})},
    description: 'Prices are numbers',
    error: 'ExpectedPriceInCentsToParseKnownPrices',
  },
  {
    args: {text: stringify({prices: {}, version: '3.abc'})},
    description: 'A version alone has no prices',
    expected: {rates: {}, version: '3.abc'},
  },
  {
    args: {
      text: stringify({
        prices: {'2025-11-01': 300, '2025-10-30': 100},
        version: '3.abc',
      }),
    },
    description: 'Each price is the price of its day',
    expected: {
      rates: {
        '2025-10-30': {cents: 100, version: '3.abc'},
        '2025-11-01': {cents: 300, version: '3.abc'},
      },
      version: '3.abc',
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, () => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');

      return;
    }

    deepEqual(method(args), expected, 'Got expected prices');

    return;
  });
});
