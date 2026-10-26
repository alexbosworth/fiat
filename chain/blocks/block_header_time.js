const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isHeaderHex = n => /^([0-9A-F]{2}){80,}$/i.test(n);
const timeOffset = 68;

/** Get the time of a block from its header

  {
    header: <Raw Block Header or Block Hex String>
  }

  @throws
  <Error>

  @returns
  {
    time: <Block Header Timestamp Epoch Seconds Number>
  }
*/
module.exports = ({header}) => {
  if (!isHeaderHex(header)) {
    throw new Error('ExpectedRawBlockHeaderHexStringToGetBlockHeaderTime');
  }

  return {time: hexAsBuffer(header).readUInt32LE(timeOffset)};
};
