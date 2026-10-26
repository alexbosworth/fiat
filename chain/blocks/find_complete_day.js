const asyncAuto = require('async/auto');
const asyncDetectSeries = require('async/detectSeries');
const {returnResult} = require('asyncjs-util');

const addDays = require('./../add_days');
const {dayLength} = require('./../../dates/constants');
const getBlocksForDate = require('./get_blocks_for_date');
const getMedianTime = require('./get_median_time');
const {msPerSecond} = require('./../constants');

const isHeight = n => Number.isInteger(n) && n >= 0;
const maxDaysBack = 7;
const yesterday = -1;

/** Find the most recent complete day of blocks before the chain tip

  {
    height: <Current Best Chain Height Number>
    lnd: <Authenticated LND API Object>
    [times]: <Block Times By Height Map Object>
  }

  @returns via cbk or Promise
  {
    day: <Day YYYY-MM-DD String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isHeight(args.height)) {
          return cbk([400, 'ExpectedCurrentChainHeightToFindCompleteDay']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToFindCompleteDay']);
        }

        return cbk();
      },

      // Block times are kept to avoid retrieving them twice
      times: ['validate', ({}, cbk) => cbk(null, args.times || new Map())],

      // Get the median time of the chain tip
      getTipTime: ['times', ({times}, cbk) => {
        return getMedianTime({
          times,
          height: args.height,
          lnd: args.lnd,
        },
        cbk);
      }],

      // Walk back from the day before the tip until a complete day is found
      findDay: ['getTipTime', 'times', ({getTipTime, times}, cbk) => {
        const tipDate = new Date(getTipTime.time * msPerSecond).toISOString();

        const tipDay = tipDate.substring(Number(), dayLength);

        const days = [...Array(maxDaysBack).keys()].map(daysBack => {
          return addDays({day: tipDay, days: yesterday - daysBack}).day;
        });

        return asyncDetectSeries(days, (date, cbk) => {
          return getBlocksForDate({
            date,
            times,
            height: args.height,
            lnd: args.lnd,
          },
          (err, res) => cbk(err, !err && !!res.is_complete));
        },
        cbk);
      }],

      // The most recent complete day
      day: ['findDay', ({findDay}, cbk) => {
        if (!findDay) {
          return cbk([503, 'FailedToFindCompleteDayBeforeChainTip']);
        }

        return cbk(null, {day: findDay});
      }],
    },
    returnResult({reject, resolve, of: 'day'}, cbk));
  });
};
