const asyncAuto = require('async/auto');
const asyncify = require('async/asyncify');
const {returnResult} = require('asyncjs-util');

const {blocksFileVersion} = require('./constants');
const isKeptBlock = require('./is_kept_block');

const {isArray} = Array;
const isObject = n => !!n && typeof n === 'object' && !Array.isArray(n);
const missingFileCode = 'ENOENT';
const {parse} = JSON;

/** Get the blocks kept in a blocks file

  A missing file has no blocks. The payment outputs of a block depend on the
  version of the method that pulled them out of the block, so a file kept by
  another version of the method, or written in another format, has no blocks.

  {
    fs: {
      getFile: <Read File Contents Function> (path, cbk) => {}
    }
    method_version: <Method Version String>
    path: <Blocks File Path String>
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
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.fs || typeof args.fs.getFile !== 'function') {
          return cbk([400, 'ExpectedFileSystemMethodsToGetBlocksFile']);
        }

        if (!args.method_version) {
          return cbk([400, 'ExpectedMethodVersionToGetBlocksFile']);
        }

        if (!args.path) {
          return cbk([400, 'ExpectedPathToGetBlocksFile']);
        }

        return cbk();
      },

      // Read the file
      getFile: ['validate', ({}, cbk) => {
        return args.fs.getFile(args.path, (err, res) => {
          // Exit early when there is no file yet
          if (!!err && err.code === missingFileCode) {
            return cbk();
          }

          if (!!err) {
            return cbk([503, 'FailedToReadBlocksFile', {err}]);
          }

          return cbk(null, res);
        });
      }],

      // Parse the file
      parseFile: ['getFile', asyncify(({getFile}) => {
        // Exit early when there is nothing in the file
        if (!getFile || !getFile.length) {
          return;
        }

        try {
          return parse(getFile.toString());
        } catch (err) {
          throw [503, 'FailedToParseBlocksFile', {err}];
        }
      })],

      // Pull out the blocks that are complete
      blocks: ['parseFile', ({parseFile}, cbk) => {
        // Exit early when there is no file of blocks of this version
        if (!isObject(parseFile) || parseFile.version !== blocksFileVersion) {
          return cbk(null, {blocks: []});
        }

        // Exit early when the blocks were kept by another method version
        if (parseFile.method_version !== args.method_version) {
          return cbk(null, {blocks: []});
        }

        const blocks = isArray(parseFile.blocks) ? parseFile.blocks : [];

        return cbk(null, {
          blocks: blocks.filter(block => isKeptBlock({block}).is_kept_block),
        });
      }],
    },
    returnResult({reject, resolve, of: 'blocks'}, cbk));
  });
};
