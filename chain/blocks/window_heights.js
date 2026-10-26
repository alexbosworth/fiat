const {half} = require('./../constants');

const {ceil} = Math;

/** Split block heights into consecutive windows of blocks

  {
    count: <Blocks Per Window Count Number>
    heights: [<Block Height Number>]
  }

  @returns
  {
    windows: [[<Block Height Number>]]
  }
*/
module.exports = ({count, heights}) => {
  const starts = [...Array(ceil(heights.length / count)).keys()];

  const windows = starts.map(i => heights.slice(i * count, (i + 1) * count));

  const [last] = windows.slice(-1);

  // Exit early when the last window is long enough to stand on its own
  if (windows.length < 2 || last.length >= count * half) {
    return {windows};
  }

  const [beforeLast] = windows.slice(-2);

  const joined = beforeLast.concat(last);

  return {windows: windows.slice(Number(), -2).concat([joined])};
};
