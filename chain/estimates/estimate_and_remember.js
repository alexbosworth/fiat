const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const estimateDayPrice = require('./estimate_day_price');
const estimateRecord = require('./estimate_record');
const {getBlockHash} = require('./../blocks');
const isAliasRatio = require('./is_alias_ratio');
const nearestEstimate = require('./nearest_estimate');
const priceWindow = require('./price_window');
const rememberEstimate = require('./remember_estimate');

const estimateKey = ({cents, day}) => [day, cents].join(' ');

/** Estimate the price for a day and remember it when it is supported

  {
    [blocks]: <Retrieved Blocks By Height Map Object>
    day: <Day YYYY-MM-DD String>
    estimates: {
      priors: {<Day YYYY-MM-DD String>: <Estimate Object>}
      provisional: {<Day YYYY-MM-DD String>: <Estimate Object>}
      rates: {<Day YYYY-MM-DD String>: <Estimate Object>}
    }
    height: <Current Best Chain Height Number>
    [is_sample]: <Estimate From a Sample of Blocks Bool>
    [is_unguided]: <Estimate Without a Neighboring Guide Bool>
    lnd: <Authenticated LND API Object>
    [logger]: <Winston Logger Object>
    put_price: <Remember Price Function> (record, cbk) => (err)
    times: <Block Times Map Object>
    [unsupported]: <Unsupported Estimates Map Object>
  }

  @returns via cbk or Promise
  <Day Price Estimate Object>
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // The nearest estimate guides the search unless the day is unguided
      guide: cbk => {
        // Exit early when a starting day is estimated on its own
        if (!!args.is_unguided) {
          return cbk(null, {});
        }

        const {estimate} = nearestEstimate({
          day: args.day,
          estimates: args.estimates,
        });

        return cbk(null, {estimate});
      },

      // The key that identifies the estimate among unsupported estimates
      key: ['guide', ({guide}, cbk) => {
        return cbk(null, estimateKey({
          cents: !guide.estimate ? undefined : guide.estimate.cents,
          day: args.day,
        }));
      }],

      // Get the estimate of the day that was found unsupported before
      getUnsupported: ['key', ({key}, cbk) => {
        // Exit early when unsupported estimates are not kept
        if (!args.unsupported) {
          return cbk();
        }

        return cbk(null, args.unsupported.get(key));
      }],

      // Get the hash of the last block of the estimate found unsupported
      getHash: ['getUnsupported', ({getUnsupported}, cbk) => {
        // Exit early when the day was not found unsupported before
        if (!getUnsupported) {
          return cbk();
        }

        const [, last] = getUnsupported.blocks;

        // Exit early when the chain no longer reaches the blocks
        if (last > args.height) {
          return cbk();
        }

        return getBlockHash({height: last, lnd: args.lnd}, cbk);
      }],

      // An estimate found unsupported holds while its blocks are in the chain
      cached: [
        'getHash',
        'getUnsupported',
        'key',
        ({getHash, getUnsupported, key}, cbk) =>
      {
        // Exit early when the day was not found unsupported before
        if (!getUnsupported) {
          return cbk();
        }

        // Exit early when the blocks are gone, so the day is estimated again
        if (!getHash || getHash.hash !== getUnsupported.hash) {
          args.unsupported.delete(key);

          return cbk();
        }

        return cbk(null, getUnsupported);
      }],

      // Estimate the price of the day
      getEstimate: ['cached', 'guide', ({cached, guide}, cbk) => {
        // Exit early when the same estimate was already found unsupported
        if (!!cached) {
          return cbk(null, cached);
        }

        const {estimate} = guide;

        const bounds = !estimate ? {} : priceWindow({cents: estimate.cents});

        return estimateDayPrice({
          blocks: args.blocks,
          date: args.day,
          height: args.height,
          is_sample: args.is_sample || undefined,
          lnd: args.lnd,
          logger: args.logger,
          max_price: bounds.max_price,
          min_price: bounds.min_price,
          times: args.times,
        },
        cbk);
      }],

      // A price at an alias of its guide means one of them is wrong
      checkAlias: ['getEstimate', 'guide', ({getEstimate, guide}, cbk) => {
        const {estimate} = guide;

        // Exit early when the price was not found beyond a guide window
        if (!getEstimate.is_widened || !estimate) {
          return cbk();
        }

        // Exit early when the price is not supported anyway
        if (!getEstimate.is_supported) {
          return cbk();
        }

        const ratio = isAliasRatio({
          cents: getEstimate.cents,
          other: estimate.cents,
        });

        if (!!ratio.is_alias) {
          return cbk([503, 'FoundPriceAtAliasOfNeighboringDayPrice', {
            cents: getEstimate.cents,
            day: args.day,
            neighbor: estimate.day,
            neighbor_cents: estimate.cents,
          }]);
        }

        return cbk();
      }],

      // Remember a supported estimate
      remember: [
        'checkAlias',
        'getEstimate',
        'key',
        ({getEstimate, key}, cbk) =>
      {
        // Exit early when the estimate is not supported by the data
        if (!getEstimate.is_supported) {
          // Keep the result so that the estimate is not made again
          if (!!args.unsupported) {
            args.unsupported.set(key, getEstimate);
          }

          return cbk(null, getEstimate);
        }

        const {record} = estimateRecord({
          date: args.day,
          estimate: getEstimate,
          is_sample: args.is_sample,
          is_unguided: args.is_unguided,
        });

        rememberEstimate({estimate: record, estimates: args.estimates});

        return args.put_price(record, err => cbk(err, getEstimate));
      }],
    },
    returnResult({reject, resolve, of: 'remember'}, cbk));
  });
};
