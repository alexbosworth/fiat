const {isArray} = Array;
const isCount = n => Number.isInteger(n) && n >= 0;
const isId = n => /^[0-9a-f]{64}$/.test(n);
const isObject = n => !!n && typeof n === 'object' && !Array.isArray(n);
const isTokens = n => Number.isInteger(n) && n > 0;

/** Determine whether a value is a block kept in a blocks file

  {
    block: <Kept Block Object>
  }

  @returns
  {
    is_kept_block: <Value Is a Kept Block Bool>
  }
*/
module.exports = ({block}) => {
  // Exit early when the block is not an object
  if (!isObject(block)) {
    return {is_kept_block: false};
  }

  const {height, id, outputs, previous, time, transactions} = block;

  // Exit early when the block does not have its ids
  if (!isId(id) || !isId(previous)) {
    return {is_kept_block: false};
  }

  // Exit early when the outputs are not output values
  if (!isArray(outputs) || !outputs.every(isTokens)) {
    return {is_kept_block: false};
  }

  return {is_kept_block: [height, time, transactions].every(isCount)};
};
