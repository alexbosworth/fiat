const {methodVersion} = require('./../../chain/known');

const centsPerDollar = 100;

/** Make an in-memory store of known prices for price lookups

  Days of a chain can start out with known prices at the prices of the chain,
  so that a lookup that is not about starting from nothing does not have to.

  {
    [chain]: <Chain Fixture Object>
    [known]: [<Index of Day With a Known Price Number>]
  }

  @returns
  {
    get_prices: <Get Known Prices Function>
    known: {
      priors: {<Day YYYY-MM-DD String>: <Known Price Object>}
      provisional: {<Day YYYY-MM-DD String>: <Known Price Object>}
      rates: {<Day YYYY-MM-DD String>: <Known Price Object>}
    }
    put_price: <Remember Price Function>
    puts: [<Remembered Price Record Object>]
  }
*/
module.exports = ({chain, known}) => {
  const prices = {priors: {}, provisional: {}, rates: {}};
  const puts = [];

  (known || []).map(n => chain.day_name(n)).forEach(day => {
    prices.rates[day] = {
      cents: chain.prices[day] * centsPerDollar,
      version: methodVersion({}).version,
    };
  });

  return {
    puts,
    get_prices: ({}, cbk) => cbk(null, prices),
    known: prices,
    put_price: (record, cbk) => {
      puts.push(record);

      const type = !!record.is_provisional ? 'provisional' : 'rates';

      prices[!!record.is_sample ? 'priors' : type][record.date] = {
        blocks: record.blocks,
        cents: record.cents,
        hash: record.hash,
        version: record.version,
      };

      if (!record.is_sample && !record.is_provisional) {
        delete prices.priors[record.date];
      }

      return cbk();
    },
  };
};
