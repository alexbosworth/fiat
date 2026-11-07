const asyncAuto = require('async/auto');
const asyncQueue = require('async/queue');
const asyncReflect = require('async/reflect');
const {returnResult} = require('asyncjs-util');

const {checkKeptBlocks} = require('./../blocks');
const {getBlocksFile} = require('./../../storage');
const {keptBlocks} = require('./../constants');
const {methodVersion} = require('./../known');
const saveKeptBlocks = require('./save_kept_blocks');

const isHeight = n => Number.isInteger(n) && n >= 0;
const withHeight = ([height, block]) => Object.assign({height}, block);

/** Get the kept blocks that are recent and still in the chain

  A blocks file that cannot be read only means fetching its blocks again, so
  the failure is logged rather than passed back

  {
    fs: {
      getFile: <Read File Contents Function> (path, cbk) => {}
      makeDirectory: <Make Directory Function> (path, cbk) => {}
      renameFile: <Rename File Function> (from, to, cbk) => {}
      writeFile: <Write File Contents Function> (path, contents, cbk) => {}
    }
    height: <Current Best Chain Height Number>
    kept: {
      [blocks]: <Kept Blocks By Height Map Object>
      [fetched]: <Heights Fetched Since a Save Was Asked For Set Object>
      [floor]: <Lowest Recent Block Height Number>
      [saved]: <Heights of the Blocks In the Blocks File Set Object>
      [saves]: <Saves of the Blocks File Queue Object>
    }
    lnd: <Authenticated LND API Object>
    [logger]: <Winston Logger Object>
    path: <Blocks File Path String>
  }

  @returns via cbk or Promise
  {
    blocks: <Kept Blocks By Height Map Object>
  }
*/
module.exports = ({fs, height, kept, lnd, logger, path}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!fs) {
          return cbk([400, 'ExpectedFileSystemMethodsToGetKeptBlocks']);
        }

        if (!isHeight(height)) {
          return cbk([400, 'ExpectedCurrentChainHeightToGetKeptBlocks']);
        }

        if (!kept) {
          return cbk([400, 'ExpectedKeptBlocksObjectToGetKeptBlocks']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToGetKeptBlocks']);
        }

        if (!path) {
          return cbk([400, 'ExpectedBlocksFilePathToGetKeptBlocks']);
        }

        return cbk();
      },

      // Read the blocks file the first time, with a failure held as a result
      getFile: ['validate', asyncReflect(({}, cbk) => {
        // Exit early when the blocks file was read before
        if (!!kept.blocks) {
          return cbk();
        }

        return getBlocksFile({
          fs,
          path,
          method_version: methodVersion({}).version,
        },
        cbk);
      })],

      // Get the blocks from the blocks file the first time, then from memory
      getBlocks: ['getFile', ({getFile}, cbk) => {
        // Exit early when the blocks were read before, to check them again
        if (!!kept.blocks) {
          return cbk(null, {blocks: [...kept.blocks].map(withHeight)});
        }

        // Exit early when the file cannot be read, so its blocks are fetched
        if (!!getFile.error) {
          if (!!logger) {
            logger.error({
              failed_to_read_kept_blocks: {path, err: getFile.error},
            });
          }

          return cbk(null, {blocks: []});
        }

        return cbk(null, getFile.value);
      }],

      // Check that the blocks are recent and still in the chain
      check: ['getBlocks', ({getBlocks}, cbk) => {
        return checkKeptBlocks({
          height,
          lnd,
          blocks: getBlocks.blocks,
          floor: height - keptBlocks,
        },
        cbk);
      }],

      // Keep the blocks that are recent and still in the chain
      keep: ['check', ({check}, cbk) => {
        const blocks = new Map(check.blocks.map(n => [n.height, n]));

        const saved = kept.saved || new Set(blocks.keys());

        kept.blocks = blocks;
        kept.fetched = new Set();
        kept.floor = height - keptBlocks;

        // A block fetched in place of a dropped block is saved as a new block
        kept.saved = new Set([...saved].filter(n => blocks.has(n)));

        // Exit early when there is already a queue of saves of the file
        if (!!kept.saves) {
          return cbk(null, {blocks});
        }

        // Saves of the blocks file are made one at a time
        kept.saves = asyncQueue(({}, cbk) => {
          return saveKeptBlocks({fs, kept, logger, path}, cbk);
        });

        return cbk(null, {blocks});
      }],
    },
    returnResult({reject, resolve, of: 'keep'}, cbk));
  });
};
