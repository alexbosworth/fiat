const asyncAuto = require('async/auto');
const asyncReflect = require('async/reflect');
const {returnResult} = require('asyncjs-util');

const {methodVersion} = require('./../known');
const {putBlocksFile} = require('./../../storage');
const {sortBy} = require('./../../arrays');

/** Save the recent kept blocks when the blocks file is missing some of them

  A blocks file that cannot be written only means fetching its blocks again,
  so the failure is logged rather than passed back

  {
    fs: {
      getFile: <Read File Contents Function> (path, cbk) => {}
      makeDirectory: <Make Directory Function> (path, cbk) => {}
      renameFile: <Rename File Function> (from, to, cbk) => {}
      writeFile: <Write File Contents Function> (path, contents, cbk) => {}
    }
    kept: {
      blocks: <Kept Blocks By Height Map Object>
      floor: <Lowest Recent Block Height Number>
      saved: <Heights of the Blocks In the Blocks File Set Object>
    }
    [logger]: <Winston Logger Object>
    path: <Blocks File Path String>
  }

  @returns via cbk or Promise
  {
    is_saved: <Blocks Were Written to the Blocks File Bool>
  }
*/
module.exports = ({fs, kept, logger, path}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // The recent kept blocks as they are stored
      blocks: cbk => {
        const recent = [...kept.blocks.entries()]
          .filter(([height]) => height >= kept.floor)
          .map(([height, block]) => ({
            height,
            id: block.id,
            outputs: block.outputs,
            previous: block.previous,
            time: block.time,
            transactions: block.transactions,
          }));

        return cbk(null, sortBy({array: recent, attribute: 'height'}).sorted);
      },

      // Determine if the file is missing any of the recent blocks
      isMissing: ['blocks', ({blocks}, cbk) => {
        const isSaved = blocks.every(block => kept.saved.has(block.height));

        return cbk(null, !isSaved);
      }],

      // Write the blocks when the file is missing some, holding any failure
      write: [
        'blocks',
        'isMissing',
        asyncReflect(({blocks, isMissing}, cbk) =>
      {
        // Exit early when the file already has all of the recent blocks
        if (!isMissing) {
          return cbk();
        }

        return putBlocksFile({
          blocks,
          fs,
          path,
          method_version: methodVersion({}).version,
        },
        cbk);
      })],

      // Remember which blocks are in the file
      saved: [
        'blocks',
        'isMissing',
        'write',
        ({blocks, isMissing, write}, cbk) =>
      {
        // Exit early when there were no blocks to write
        if (!isMissing) {
          return cbk(null, {is_saved: false});
        }

        // Exit early when the blocks were not written, to be tried again
        if (!!write.error) {
          if (!!logger) {
            logger.error({
              failed_to_save_kept_blocks: {path, err: write.error},
            });
          }

          return cbk(null, {is_saved: false});
        }

        kept.saved = new Set(blocks.map(block => block.height));

        return cbk(null, {is_saved: true});
      }],
    },
    returnResult({reject, resolve, of: 'saved'}, cbk));
  });
};
