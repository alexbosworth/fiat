const bufferAsHex = buffer => buffer.toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isHeaderHex = n => /^([0-9A-F]{2}){80,}$/i.test(n);
const previousEnd = 36;
const previousStart = 4;

/** Get the id of the block before a block from its header

  {
    header: <Raw Block Header or Block Hex String>
  }

  @throws
  <Error>

  @returns
  {
    previous: <Previous Block Id Hex String>
  }
*/
module.exports = ({header}) => {
  if (!isHeaderHex(header)) {
    throw new Error('ExpectedRawBlockHeaderHexStringToGetPreviousBlockId');
  }

  const previous = hexAsBuffer(header).subarray(previousStart, previousEnd);

  // A header has the id of the block before it, stored byte-reversed
  return {previous: bufferAsHex(previous.reverse())};
};
