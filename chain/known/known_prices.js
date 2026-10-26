const {join} = require('path');
const {readFileSync} = require('fs');

const methodVersion = require('./method_version');
const parseKnownPrices = require('./parse_known_prices');

const fileName = 'known_prices.json';
const loaded = new Map();

/** Get the prices that were shipped with the method

  {}

  @throws
  <Error>

  @returns
  {
    rates: {
      <Day YYYY-MM-DD String>: {
        cents: <USD Cents Per BTC Number>
        version: <Method Version String>
      }
    }
  }
*/
module.exports = ({}) => {
  // Exit early when the prices were already read
  if (loaded.has(fileName)) {
    return {rates: loaded.get(fileName)};
  }

  const text = readFileSync(join(__dirname, fileName), 'utf8');

  const {rates, version} = parseKnownPrices({text});

  // Prices derived by another version of the method are not used
  const current = version === methodVersion({}).version ? rates : {};

  loaded.set(fileName, current);

  return {rates: current};
};
