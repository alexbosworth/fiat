const asyncAuto = require('async/auto');
const asyncMapLimit = require('async/mapLimit');
const {returnResult} = require('asyncjs-util');

const getBlockId = require('./get_block_id');
const {sortBy} = require('./../../arrays');

const checkLimit = 4;
const flatten = arr => [].concat(...arr);
const {isArray} = Array;
const isHeight = n => Number.isInteger(n) && n >= 0;
const {isInteger} = Number;
const isNext = ({block, child}) => child.height === block.height + 1;
const isParent = ({block, child}) => child.previous === block.id;

/** Check that blocks kept from before are recent and still in the chain

  {
    blocks: [{
      height: <Block Height Number>
      id: <Block Id Hex String>
      outputs: [<Payment Output Tokens Number>]
      previous: <Previous Block Id Hex String>
      time: <Block Header Time Number>
      transactions: <Payment Transactions Count Number>
    }]
    floor: <Lowest Height To Keep Number>
    height: <Current Best Chain Height Number>
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
  {
    blocks: [{
      height: <Block Height Number>
      id: <Block Id Hex String>
      outputs: [<Payment Output Tokens Number>]
      previous: <Previous Block Id Hex String>
      time: <Block Header Time Number>
      transactions: <Payment Transactions Count Number>
    }]
  }
*/
module.exports = ({blocks, floor, height, lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isArray(blocks)) {
          return cbk([400, 'ExpectedBlocksToCheckKeptBlocks']);
        }

        if (!isInteger(floor)) {
          return cbk([400, 'ExpectedLowestHeightToCheckKeptBlocks']);
        }

        if (!isHeight(height)) {
          return cbk([400, 'ExpectedCurrentChainHeightToCheckKeptBlocks']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToCheckKeptBlocks']);
        }

        return cbk();
      },

      // Group the recent blocks into runs that link down from their highest
      runs: ['validate', ({}, cbk) => {
        const recent = blocks.filter(block => {
          return block.height >= floor && block.height <= height;
        });

        const {sorted} = sortBy({array: recent, attribute: 'height'});

        // Walk down the blocks, adding each parent to the run of its child
        const runs = sorted.reverse().reduce((sum, block) => {
          const [run] = sum.slice().reverse();

          const [lowest] = !run ? [] : run.slice().reverse();

          const isLinked = !!lowest && isParent({block, child: lowest});

          // Exit early when the block starts a run of its own
          if (!isLinked || !isNext({block, child: lowest})) {
            return sum.concat([[block]]);
          }

          run.push(block);

          return sum;
        },
        []);

        return cbk(null, runs);
      }],

      // Keep the runs whose highest block is still in the chain
      check: ['runs', ({runs}, cbk) => {
        return asyncMapLimit(runs, checkLimit, (run, cbk) => {
          const [highest] = run;

          return getBlockId({lnd, height: highest.height}, (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            // Exit early when the chain has another block at the height
            if (res.id !== highest.id) {
              return cbk(null, []);
            }

            return cbk(null, run);
          });
        },
        cbk);
      }],

      // The blocks that are still in the chain
      kept: ['check', ({check}, cbk) => cbk(null, {blocks: flatten(check)})],
    },
    returnResult({reject, resolve, of: 'kept'}, cbk));
  });
};
