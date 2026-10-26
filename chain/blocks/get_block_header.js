const asyncAuto = require('async/auto');
const {getBlockHeader} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const isHeight = n => Number.isInteger(n) && n >= 0;

/** Get the header of a block in the chain using the LND chain backend

  {
    height: <Block Height Number>
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
  {
    header: <Raw Block Header Hex String>
  }
*/
module.exports = ({height, lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isHeight(height)) {
          return cbk([400, 'ExpectedBlockHeightToGetBlockHeader']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToGetBlockHeader']);
        }

        return cbk();
      },

      // Get the block header
      getHeader: ['validate', ({}, cbk) => getBlockHeader({height, lnd}, cbk)],

      // The block header
      header: ['getHeader', ({getHeader}, cbk) => {
        return cbk(null, {header: getHeader.header});
      }],
    },
    returnResult({reject, resolve, of: 'header'}, cbk));
  });
};
