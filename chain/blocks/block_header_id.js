const {createHash} = require('crypto');

const bufferAsHex = buffer => buffer.toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isHeaderHex = n => /^[0-9A-F]{160}$/i.test(n);
const sha256 = buffer => createHash('sha256').update(buffer).digest();

/** Get the id of a block from its header

  {
    header: <Raw Block Header Hex String>
  }

  @throws
  <Error>

  @returns
  {
    id: <Block Id Hex String>
  }
*/
module.exports = ({header}) => {
  if (!isHeaderHex(header)) {
    throw new Error('ExpectedRawBlockHeaderHexStringToGetBlockId');
  }

  // Block ids are the double SHA256 of the header, shown byte-reversed
  return {id: bufferAsHex(sha256(sha256(hexAsBuffer(header))).reverse())};
};
