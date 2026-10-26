const {centsPerDollar} = require('./../constants');

const {round} = Math;
const windowAbovePrior = 1.2;
const windowBelowPrior = 0.62;

/** Get the price window to search within given a nearby price estimate

  {
    cents: <Nearby Estimate USD Cents Per BTC Number>
  }

  @returns
  {
    max_price: <Maximum Possible USD Price Number>
    min_price: <Minimum Possible USD Price Number>
  }
*/
module.exports = ({cents}) => {
  // Less than a factor of two wide, so aliases at two or more are outside
  return {
    max_price: round(cents * windowAbovePrior) / centsPerDollar,
    min_price: round(cents * windowBelowPrior) / centsPerDollar,
  };
};
