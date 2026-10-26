const asyncAuto = require('async/auto');
const {getBlock} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const {blockHeaderHexLength} = require('./../constants');
const blockHeaderTime = require('./block_header_time');
const paymentOutputsFromBlock = require('./payment_outputs_from_block');

const flatten = arr => [].concat(...arr);
const headerFromBlock = block => block.slice(Number(), blockHeaderHexLength);
const isHeight = n => Number.isInteger(n) && n >= 0;

/** Get the payment outputs and the time of a block

  {
    [blocks]: <Retrieved Blocks Map Object>
    height: <Block Height Number>
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
  {
    outputs: [<Payment Output Tokens Number>]
    time: <Block Header Time Number>
    transactions: <Payment Transactions Count Number>
  }
*/
module.exports = ({blocks, height, lnd}, cbk) => {
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
                outputs: flatten(transactions.map(tx => tx.outputs)),
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

        return cbk(null, parsed.payments);
      }],
    },
    returnResult({reject, resolve, of: 'payments'}, cbk));
  });
};
