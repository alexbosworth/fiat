const {join} = require('path');
const {readFileSync} = require('fs');

const addDays = require('./../chain/add_days');
const {dayLength} = require('./../dates/constants');
const daysThrough = require('./days_through');
const {earliestSupportedDay} = require('./../chain/known');
const {methodVersion} = require('./../chain/known');
const {parseKnownPrices} = require('./../chain/known');

const defaultFile = join(__dirname, '../chain/known/known_prices.json');
const {keys} = Object;
const maxAgeDays = 7;

/** Check that the prices shipped with the method are ready for a release

  {
    now: <Current Time Epoch Milliseconds Number>
    text: <Known Prices File Text String>
  }

  @returns
  {
    problems: [<Problem Description String>]
  }
*/
const checkKnownPrices = ({now, text}) => {
  const parsed = (() => {
    try {
      return parseKnownPrices({text});
    } catch (err) {
      return {err};
    }
  })();

  // Exit early when the file cannot be read as known prices
  if (!!parsed.err) {
    return {problems: [`the file cannot be read: ${parsed.err.message}`]};
  }

  const days = keys(parsed.rates).sort();
  const {version} = methodVersion({});

  // Exit early when there are no prices at all
  if (!days.length) {
    return {problems: ['there are no prices']};
  }

  const [first] = days;
  const [last] = days.slice(-1);
  const problems = [];

  if (parsed.version !== version) {
    const was = parsed.version;

    problems.push(`the prices are of method ${was}, not ${version}`);
  }

  const earliest = earliestSupportedDay({}).day;

  if (first !== earliest) {
    problems.push(`the prices start on ${first}, not on ${earliest}`);
  }

  const span = daysThrough({first, last}).days;

  if (span.length !== days.length) {
    problems.push(`days without a price: ${span.length - days.length}`);
  }

  const today = new Date(now).toISOString().slice(Number(), dayLength);

  const oldest = addDays({day: today, days: -maxAgeDays}).day;

  if (last < oldest) {
    problems.push(`the last price is for ${last}, over a week ago`);
  }

  return {problems};
};

module.exports = checkKnownPrices;

// Run when called directly, stopping a publish when the prices are not ready
if (require.main === module) {
  const {problems} = checkKnownPrices({
    now: Date.now(),
    text: readFileSync(defaultFile, 'utf8'),
  });

  if (!!problems.length) {
    console.error('The shipped prices are not ready for a release:');

    problems.forEach(problem => console.error(`  ${problem}`));

    console.error('Run npm run update-known-prices and commit the table.');

    process.exit(1);
  }

  console.log('The shipped prices are ready for a release');
}
