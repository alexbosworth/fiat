const asyncAuto = require('async/auto');
const asyncMapLimit = require('async/mapLimit');
const {returnResult} = require('asyncjs-util');

const blockHeaderTime = require('./block_header_time');
const {fetchLimit} = require('./../constants');
const getBlockHeader = require('./get_block_header');

const {floor} = Math;
const isHeight = n => Number.isInteger(n) && n >= 0;
const {max} = Math;
const medianWindowBlocks = 11;
const range = (a, b) => [...Array(b - a).keys()].map(i => a + i);

/** Get the median time past of a block

  {
    height: <Block Height Number>
    lnd: <Authenticated LND API Object>
    [times]: <Block Times By Height Map Object>
  }

  @returns via cbk or Promise
  {
    time: <Median Time Past Epoch Seconds Number>
  }
*/
module.exports = ({height, lnd, times}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isHeight(height)) {
          return cbk([400, 'ExpectedBlockHeightToGetMedianTime']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToGetMedianTime']);
        }

        return cbk();
      },

      // Get the times of the block and the blocks before it
      getTimes: ['validate', ({}, cbk) => {
        const known = times || new Map();
        const start = max(Number(), height - medianWindowBlocks + 1);

        const heights = range(start, height + 1);

        return asyncMapLimit(heights, fetchLimit, (height, cbk) => {
          // Exit early when the time of the block is already known
          if (known.has(height)) {
            return cbk(null, known.get(height));
          }

          return getBlockHeader({height, lnd}, (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            const {time} = (() => {
              try {
                return blockHeaderTime({header: res.header});
              } catch (err) {
                return {};
              }
            })();

            // Exit early when the header has no time to read
            if (time === undefined) {
              return cbk([503, 'ExpectedBlockHeaderToGetMedianTime']);
            }

            known.set(height, time);

            return cbk(null, time);
          });
        },
        cbk);
      }],

      // The median time is the middle of the sorted times
      median: ['getTimes', ({getTimes}, cbk) => {
        const sorted = getTimes.slice().sort((a, b) => a - b);

        return cbk(null, {time: sorted[floor(sorted.length / 2)]});
      }],
    },
    returnResult({reject, resolve, of: 'median'}, cbk));
  });
};
