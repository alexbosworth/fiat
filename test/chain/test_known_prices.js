const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {join} = require('path');
const {readFileSync} = require('fs');

const {earliestSupportedDay} = require('./../../chain/known');
const method = require('./../../chain/known/known_prices');
const {parseKnownPrices} = require('./../../chain/known');

const file = join(__dirname, '../../chain/known/known_prices.json');

// Get the shipped prices twice, checking that they are prices in the range
const knownPrices = args => {
  const {rates} = method(args);

  const days = Object.keys(rates);

  return {
    rates,
    is_in_cents: days.every(day => rates[day].cents > 0),
    is_in_range: days.every(day => day >= earliestSupportedDay({}).day),
    is_read_once: method(args).rates === rates,
  };
};

const tests = [
  {
    args: {},
    description: 'The prices shipped with the method are read once',
    expected: {
      is_in_cents: true,
      is_in_range: true,
      is_read_once: true,
      rates: parseKnownPrices({text: readFileSync(file, 'utf8')}).rates,
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(knownPrices(args), expected, 'Got expected prices');

    return;
  });
});
