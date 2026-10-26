const asyncAuto = require('async/auto');
const asyncEachLimit = require('async/eachLimit');
const {returnResult} = require('asyncjs-util');

const {getBlockHash} = require('./../blocks');

const checkLimit = 4;
const flatten = arr => [].concat(...arr);
const {isArray} = Array;
const isHeight = n => Number.isInteger(n) && n >= 0;
const {keys} = Object;
const recentBlocks = 1008;
const sortByDay = (a, b) => a.day.localeCompare(b.day);

/** Check that recently derived known estimates are still in the chain

  {
    estimates: {
      priors: {<Day YYYY-MM-DD String>: <Estimate Object>}
      [provisional]: {<Day YYYY-MM-DD String>: <Estimate Object>}
      rates: {<Day YYYY-MM-DD String>: <Estimate Object>}
    }
    height: <Current Best Chain Height Number>
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
  {
    removed: [{
      day: <Removed Estimate Day YYYY-MM-DD String>
      hash: <Last Block Hash Of the Removed Estimate Hex String>
    }]
  }
*/
module.exports = ({estimates, height, lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!estimates || !estimates.priors || !estimates.rates) {
          return cbk([400, 'ExpectedKnownEstimatesToCheckKnownEstimates']);
        }

        if (!isHeight(height)) {
          return cbk([400, 'ExpectedChainHeightToCheckKnownEstimates']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToCheckKnownEstimates']);
        }

        return cbk();
      },

      // Collect the estimates that have a recent block to check
      recent: ['validate', ({}, cbk) => {
        const {priors, provisional, rates} = estimates;

        const sources = [priors, provisional || {}, rates];

        const known = flatten(sources.map(source => {
          return keys(source).map(day => {
            return {day, source, estimate: source[day]};
          });
        }));

        const checks = known.filter(({estimate}) => {
          // Exit early when there is no block to check against
          if (!estimate.hash || !isArray(estimate.blocks)) {
            return false;
          }

          const [, last] = estimate.blocks;

          // Deeply buried blocks do not get reorganized so skip checking them
          return isHeight(last) && height - last < recentBlocks;
        });

        return cbk(null, checks);
      }],

      // Check the hashes of the last blocks against the chain
      check: ['recent', ({recent}, cbk) => {
        const removed = [];

        return asyncEachLimit(recent, checkLimit, (known, cbk) => {
          const {day, estimate, source} = known;

          const [, last] = estimate.blocks;

          // Exit early when the chain has not reached the block yet, since
          // the estimate cannot be checked it is only set aside
          if (last > height) {
            delete source[day];

            return cbk();
          }

          return getBlockHash({lnd, height: last}, (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            // The chain was reorganized past the block the estimate used
            if (res.hash !== estimate.hash) {
              removed.push({day, hash: estimate.hash});

              delete source[day];
            }

            return cbk();
          });
        },
        err => cbk(err, {removed: removed.sort(sortByDay)}));
      }],
    },
    returnResult({reject, resolve, of: 'check'}, cbk));
  });
};
