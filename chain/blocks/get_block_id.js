const asyncAuto = require('async/auto');
const asyncify = require('async/asyncify');
const {returnResult} = require('asyncjs-util');

const blockHeaderId = require('./block_header_id');
const getBlockHeader = require('./get_block_header');

const isHeight = n => Number.isInteger(n) && n >= 0;

/** Get the id of the block at a height in the chain

  {
    height: <Block Height Number>
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
  {
    id: <Block Id Hex String>
  }
*/
module.exports = ({height, lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isHeight(height)) {
          return cbk([400, 'ExpectedBlockHeightToGetBlockId']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToGetBlockId']);
        }

        return cbk();
      },

      // Get the block header
      getHeader: ['validate', ({}, cbk) => getBlockHeader({height, lnd}, cbk)],

      // Derive the id of the block from its header
      getId: ['getHeader', asyncify(({getHeader}) => {
        try {
          return blockHeaderId({header: getHeader.header});
        } catch (err) {
          throw [503, 'ExpectedBlockHeaderToGetBlockId', {err}];
        }
      })],
    },
    returnResult({reject, resolve, of: 'getId'}, cbk));
  });
};
