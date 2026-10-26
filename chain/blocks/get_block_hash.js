const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const blockHeaderHash = require('./block_header_hash');
const getBlockHeader = require('./get_block_header');

const isHeight = n => Number.isInteger(n) && n >= 0;

/** Get the hash of the block at a height in the chain

  {
    height: <Block Height Number>
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
  {
    hash: <Block Hash Hex String>
  }
*/
module.exports = ({height, lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isHeight(height)) {
          return cbk([400, 'ExpectedBlockHeightToGetBlockHash']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToGetBlockHash']);
        }

        return cbk();
      },

      // Get the block header
      getHeader: ['validate', ({}, cbk) => getBlockHeader({height, lnd}, cbk)],

      // Hash the block header
      getHash: ['getHeader', ({getHeader}, cbk) => {
        const hashed = (() => {
          try {
            return blockHeaderHash({header: getHeader.header});
          } catch (err) {
            return {};
          }
        })();

        // Exit early when the header cannot be hashed
        if (!hashed.hash) {
          return cbk([503, 'ExpectedBlockHeaderToGetBlockHash']);
        }

        return cbk(null, {hash: hashed.hash});
      }],
    },
    returnResult({reject, resolve, of: 'getHash'}, cbk));
  });
};
