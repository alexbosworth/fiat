const {deepEqual} = require('node:assert').strict;
const {ok} = require('node:assert').strict;
const test = require('node:test');

const {join} = require('path');
const {readFileSync} = require('fs');

const {earliestSupportedDay} = require('./../../chain/known');
const method = require('./../../chain/known/known_prices');
const {methodVersion} = require('./../../chain/known');
const {parseKnownPrices} = require('./../../chain/known');

const file = join(__dirname, '../../chain/known/known_prices.json');

test('The prices shipped with the method are read once', () => {
  const {rates} = method({});

  const {version} = methodVersion({});

  const shipped = parseKnownPrices({text: readFileSync(file, 'utf8')});

  // The shipped prices have to be of the current method to be used at all
  deepEqual(shipped.version, version, 'The shipped prices are current');
  ok(!!Object.keys(rates).length, 'Shipped prices are returned');

  deepEqual(
    Object.keys(rates).length,
    Object.keys(shipped.rates).length,
    'Every shipped price is returned'
  );

  Object.keys(rates).forEach(day => {
    ok(day >= earliestSupportedDay({}).day, 'Prices are in the range');
    deepEqual(rates[day].version, version, 'Prices are of the method');
    ok(rates[day].cents > 0, 'Prices are in cents');

    return;
  });

  deepEqual(method({}).rates, rates, 'The same prices are returned again');

  return;
});
