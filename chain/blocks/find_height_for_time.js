const asyncAuto = require('async/auto');
const asyncTimesSeries = require('async/timesSeries');
const {returnResult} = require('asyncjs-util');

const getMedianTime = require('./get_median_time');

const {ceil} = Math;
const {floor} = Math;
const isHeight = n => Number.isInteger(n) && n >= 0;
const {log2} = Math;

/** Find the heights where the median time past of blocks crosses a time

  {
    height: <Current Best Chain Height Number>
    lnd: <Authenticated LND API Object>
    low: <Lowest Height to Consider Number>
    time: <Time Epoch Seconds Number>
    [times]: <Block Times By Height Map Object>
  }

  @returns via cbk or Promise
  {
    at_or_after: <First Height With Median Time At Or After Time Number>
    before: <Last Height With Median Time Before Time Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isHeight(args.height)) {
          return cbk([400, 'ExpectedCurrentChainHeightToFindHeightForTime']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToFindHeightForTime']);
        }

        if (!isHeight(args.low)) {
          return cbk([400, 'ExpectedLowestHeightToFindHeightForTime']);
        }

        if (!isHeight(args.time)) {
          return cbk([400, 'ExpectedTimeToFindHeightForTime']);
        }

        return cbk();
      },

      // Binary search for the first height with a median time at or after
      search: ['validate', ({}, cbk) => {
        const bounds = {high: args.height + 1, low: args.low};
        const {lnd} = args;
        const times = args.times || new Map();

        // A binary search takes a bounded number of steps
        const steps = ceil(log2(bounds.high - bounds.low + 1)) + 1;

        return asyncTimesSeries(steps, (i, cbk) => {
          // Exit early when the search has narrowed to a single height
          if (bounds.low >= bounds.high) {
            return cbk();
          }

          const mid = floor((bounds.low + bounds.high) / 2);

          return getMedianTime({lnd, times, height: mid}, (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            if (res.time >= args.time) {
              bounds.high = mid;
            } else {
              bounds.low = mid + 1;
            }

            return cbk();
          });
        },
        err => cbk(err, bounds.low));
      }],

      // Determine the crossing heights
      crossing: ['search', ({search}, cbk) => {
        return cbk(null, {at_or_after: search, before: search - 1});
      }],
    },
    returnResult({reject, resolve, of: 'crossing'}, cbk));
  });
};
