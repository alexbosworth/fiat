const {centsPerDollar} = require('./../chain/constants');

const {assign} = Object;
const dollars = cents => (cents / centsPerDollar).toFixed(2);

/** Make an in-memory store of known prices for deriving prices

  {
    log: <Log Line Function> (line) => {}
    rates: {<Day YYYY-MM-DD String>: {cents: <USD Cents Number>}}
    requested: <Requested Days Set Object>
  }

  @returns
  {
    get_prices: <Get Known Prices Function>
    known: {
      priors: {<Day YYYY-MM-DD String>: <Estimate Object>}
      provisional: {<Day YYYY-MM-DD String>: <Estimate Object>}
      rates: {<Day YYYY-MM-DD String>: <Estimate Object>}
    }
    put_price: <Remember Price Function>
  }
*/
module.exports = ({log, rates, requested}) => {
  const known = {priors: {}, provisional: {}, rates: assign({}, rates)};

  return {
    known,
    get_prices: ({}, cbk) => cbk(null, known),
    put_price: (record, cbk) => {
      const full = !!record.is_sample ? 'priors' : 'rates';

      // A provisional price is kept apart from the prices of complete days
      const type = !!record.is_provisional ? 'provisional' : full;

      const price = dollars(record.cents);

      // Prices found on the way to a requested day are logged as they come
      if (!!record.is_sample) {
        log(`  bridged ${record.date} at ${price} from a sample of blocks`);
      } else if (!requested.has(record.date)) {
        log(`  started from ${record.date} at ${price} from all its blocks`);
      }

      known[type][record.date] = {
        blocks: record.blocks,
        cents: record.cents,
        hash: record.hash,
        version: record.version,
      };

      // A full day price replaces a sample estimate of the same day
      if (type === 'rates') {
        delete known.priors[record.date];
      }

      return cbk();
    },
  };
};
