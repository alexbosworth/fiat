const asyncAuto = require('async/auto');
const {getBlock} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const {blockHeaderHexLength} = require('./../constants');
const blockHeaderId = require('./block_header_id');
const blockHeaderPrevious = require('./block_header_previous');
const blockHeaderTime = require('./block_header_time');
const paymentOutputsFromBlock = require('./payment_outputs_from_block');

const flatten = arr => [].concat(...arr);
const headerFromBlock = block => block.slice(Number(), blockHeaderHexLength);
const isHeight = n => Number.isInteger(n) && n >= 0;

/** Get the payment outputs and the time of a block

  {
    [blocks]: <Retrieved Blocks Map Object>
    [fetched]: <Block Fetched Function> ({height}) => {}
    height: <Block Height Number>
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
  {
    id: <Block Id Hex String>
    outputs: [<Payment Output Tokens Number>]
    previous: <Previous Block Id Hex String>
    time: <Block Header Time Number>
    transactions: <Payment Transactions Count Number>
  }
*/
module.exports = ({blocks, fetched, height, lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!!blocks && !(blocks instanceof Map)) {
          return cbk([400, 'ExpectedBlocksMapToGetBlockPayments']);
        }

        if (!isHeight(height)) {
          return cbk([400, 'ExpectedBlockHeightToGetBlockPayments']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToGetBlockPayments']);
        }

        return cbk();
      },

      // Get the block unless it was already retrieved
      getBlock: ['validate', ({}, cbk) => {
        // Exit early when the block was already retrieved
        if (!!blocks && blocks.has(height)) {
          return cbk();
        }

        return getBlock({height, lnd}, cbk);
      }],

      // Pull out the payment outputs and the time of the block
      payments: ['getBlock', ({getBlock}, cbk) => {
        // Exit early when the block was already retrieved
        if (!getBlock) {
          return cbk(null, blocks.get(height));
        }

        const parsed = (() => {
          try {
            const {transactions} = paymentOutputsFromBlock({
              block: getBlock.block,
            });

            const header = headerFromBlock(getBlock.block);

            return {
              payments: {
                id: blockHeaderId({header}).id,
                outputs: flatten(transactions.map(tx => tx.outputs)),
                previous: blockHeaderPrevious({header}).previous,
                time: blockHeaderTime({header}).time,
                transactions: transactions.length,
              },
            };
          } catch (err) {
            return {err};
          }
        })();

        // Exit early when the block cannot be parsed
        if (!!parsed.err) {
          return cbk([503, 'FailedToParseBlockToGetPrice', {err: parsed.err}]);
        }

        // Keep the block for other estimates from the same blocks
        if (!!blocks) {
          blocks.set(height, parsed.payments);
        }

        if (!!fetched) {
          fetched({height});
        }

        return cbk(null, parsed.payments);
      }],
    },
    returnResult({reject, resolve, of: 'payments'}, cbk));
  });
};
