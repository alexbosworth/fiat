const {numberAsCompactInt} = require('@alexbosworth/blockchain');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const bufferAsHex = buffer => buffer.toString('hex');
const encodeCount = number => numberAsCompactInt({number}).encoded;
const headerByteLength = 80;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const idByteLength = 32;
const locktime = 0;
const previousOffset = 4;
const scriptByteLength = 22;
const sequence = 0xffffffff;
const timeOffset = 68;
const version = 2;
const vout = 0;

/** Make a raw block of transactions that each spend an output to outputs

  {
    previous: <Previous Block Id Hex String>
    time: <Block Time Epoch Seconds Number>
    transactions: [[<Output Tokens Number>]]
  }

  @returns
  {
    block: <Raw Block Hex String>
    header: <Raw Block Header Hex String>
  }
*/
module.exports = ({previous, time, transactions}) => {
  const header = Buffer.alloc(headerByteLength);
  const id = bufferAsHex(Buffer.alloc(idByteLength));
  const script = bufferAsHex(Buffer.alloc(scriptByteLength));

  hexAsBuffer(previous).reverse().copy(header, previousOffset);

  header.writeUInt32LE(time, timeOffset);

  const txs = transactions.map(tokens => transactionFromComponents({
    locktime,
    version,
    inputs: [{id, sequence, vout, script: String()}],
    outputs: tokens.map(value => ({script, tokens: value})),
  }));

  const elements = [header, encodeCount(txs.length)];

  const raw = txs.map(({transaction}) => hexAsBuffer(transaction));

  return {
    block: bufferAsHex(Buffer.concat(elements.concat(raw))),
    header: bufferAsHex(header),
  };
};
