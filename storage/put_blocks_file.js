const {dirname} = require('path');

const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {blocksFileVersion} = require('./constants');
const {fsMethods} = require('./constants');
const tempPath = require('./temp_path');

const {isArray} = Array;
const isFunction = n => typeof n === 'function';
const {stringify} = JSON;

/** Store blocks in a blocks file in place of the blocks that were there

  {
    blocks: [{
      height: <Block Height Number>
      id: <Block Id Hex String>
      outputs: [<Payment Output Tokens Number>]
      previous: <Previous Block Id Hex String>
      time: <Block Header Time Number>
      transactions: <Payment Transactions Count Number>
    }]
    fs: {
      getFile: <Read File Contents Function> (path, cbk) => {}
      makeDirectory: <Make Directory Function> (path, cbk) => {}
      renameFile: <Rename File Function> (from, to, cbk) => {}
      writeFile: <Write File Contents Function> (path, contents, cbk) => {}
    }
    method_version: <Method Version String>
    path: <Blocks File Path String>
  }

  @returns via cbk or Promise
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isArray(args.blocks)) {
          return cbk([400, 'ExpectedBlocksToPutBlocksFile']);
        }

        if (!args.fs || !fsMethods.every(n => isFunction(args.fs[n]))) {
          return cbk([400, 'ExpectedFileSystemMethodsToPutBlocksFile']);
        }

        if (!args.method_version) {
          return cbk([400, 'ExpectedMethodVersionToPutBlocksFile']);
        }

        if (!args.path) {
          return cbk([400, 'ExpectedPathToPutBlocksFile']);
        }

        return cbk();
      },

      // Make sure the directory exists, it may already be there
      makeDirectory: ['validate', ({}, cbk) => {
        return args.fs.makeDirectory(dirname(args.path), () => cbk());
      }],

      // Each write has its own temporary file
      temp: ['validate', ({}, cbk) => {
        return cbk(null, tempPath({path: args.path}).path);
      }],

      // Write to a temporary file so a partial write is never seen
      write: ['makeDirectory', 'temp', ({temp}, cbk) => {
        // The file is only read by this package, so it is kept compact
        const contents = stringify({
          blocks: args.blocks,
          method_version: args.method_version,
          version: blocksFileVersion,
        });

        return args.fs.writeFile(temp, contents, err => {
          if (!!err) {
            return cbk([503, 'FailedToWriteBlocksFile', {err}]);
          }

          return cbk();
        });
      }],

      // Atomically swap the temporary file in place of the blocks file
      swap: ['temp', 'write', ({temp}, cbk) => {
        return args.fs.renameFile(temp, args.path, err => {
          if (!!err) {
            return cbk([503, 'FailedToReplaceBlocksFile', {err}]);
          }

          return cbk();
        });
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
