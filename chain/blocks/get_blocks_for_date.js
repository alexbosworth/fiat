const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {confirmationsAfterDay} = require('./../constants');
const findHeightForTime = require('./find_height_for_time');
const {isCalendarDay} = require('./../../dates');
const {msPerSecond} = require('./../constants');

const dayFormat = /^\d{4}-\d{2}-\d{2}$/;
const isHeight = n => Number.isInteger(n) && n >= 0;
const range = (a, b) => [...Array(b - a).keys()].map(i => a + i);
const secondsPerDay = 60 * 60 * 24;

/** Get the heights of the blocks that belong to a UTC calendar day

  {
    date: <Day YYYY-MM-DD String>
    height: <Current Best Chain Height Number>
    lnd: <Authenticated LND API Object>
    [times]: <Block Times By Height Map Object>
  }

  @returns via cbk or Promise
  {
    heights: [<Block Height Number>]
    is_complete: <Day Is Complete Bool>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.date || !dayFormat.test(args.date)) {
          return cbk([400, 'ExpectedYyyyMmDdDateToGetBlocksForDate']);
        }

        if (!isCalendarDay({day: args.date}).is_calendar_day) {
          return cbk([400, 'ExpectedValidDateToGetBlocksForDate']);
        }

        if (!isHeight(args.height)) {
          return cbk([400, 'ExpectedCurrentChainHeightToGetBlocksForDate']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToGetBlocksForDate']);
        }

        return cbk();
      },

      // Determine the start and end times of the day
      times: ['validate', ({}, cbk) => {
        const start = Date.parse(`${args.date}T00:00:00.000Z`) / msPerSecond;

        return cbk(null, {start, end: start + secondsPerDay});
      }],

      // Block times are kept to avoid retrieving them twice
      known: ['validate', ({}, cbk) => cbk(null, args.times || new Map())],

      // Find the first block on the day
      getFirst: ['known', 'times', ({known, times}, cbk) => {
        return findHeightForTime({
          height: args.height,
          lnd: args.lnd,
          low: Number(),
          time: times.start,
          times: known,
        },
        cbk);
      }],

      // Find the block after the last block on the day
      getNext: [
        'getFirst',
        'known',
        'times',
        ({getFirst, known, times}, cbk) =>
      {
        return findHeightForTime({
          height: args.height,
          lnd: args.lnd,
          low: getFirst.at_or_after,
          time: times.end,
          times: known,
        },
        cbk);
      }],

      // Determine the blocks on the day
      blocks: ['getFirst', 'getNext', ({getFirst, getNext}, cbk) => {
        const first = getFirst.at_or_after;
        const next = getNext.at_or_after;

        const heights = range(first, next);

        // A day is complete when it has blocks and enough blocks after it
        const confirmed = next + confirmationsAfterDay <= args.height + 1;

        return cbk(null, {
          heights,
          is_complete: !!heights.length && confirmed,
        });
      }],
    },
    returnResult({reject, resolve, of: 'blocks'}, cbk));
  });
};
