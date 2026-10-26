const {compactIntAsNumber} = require('@alexbosworth/blockchain');

const {blockHeaderByteLength} = require('./../constants');
const {maxTokens} = require('./../constants');
const {minTokens} = require('./../constants');

const byteCountHash = 32;
const byteCountInt32 = 4;
const byteCountInt64 = 8;
const byteCountMarkerFlag = 2;
const coinbaseInputIndex = 0xffffffff;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isHex = n => !!n && !(n.length % 2) && /^[0-9A-F]*$/i.test(n);
const maxInputsCount = 5;
const maxWitnessBytes = 500;
const opReturn = 0x6a;
const paymentOutputsCount = 2;
const witnessFlagValue = 1;
const witnessMarkerValue = 0;

/** Derive payment-like outputs from a raw block for on-chain price analysis

  {
    block: <Hex Encoded Raw Block String>
  }

  @throws
  <Error>

  @returns
  {
    transactions: [{
      outputs: [<Output Tokens Number>]
    }]
  }
*/
module.exports = ({block}) => {
  if (!isHex(block)) {
    throw new Error('ExpectedHexEncodedBlockToDerivePaymentOutputs');
  }

  const buffer = hexAsBuffer(block);

  // Exit early with error when the block header data is cut short
  if (buffer.length <= blockHeaderByteLength) {
    throw new Error('ExpectedBlockHeaderAndTransactionsToDeriveOutputs');
  }

  const transactions = [];

  // A compact int count of transactions follows the block header
  const txCount = compactIntAsNumber({
    encoded: buffer,
    start: blockHeaderByteLength,
  });

  const readCount = () => {
    const count = compactIntAsNumber({encoded: buffer, start: cursor});

    cursor += count.bytes;

    return count.number;
  };

  let cursor = blockHeaderByteLength + txCount.bytes;
  let remaining = txCount.number;

  // Iterate forward through the block, parsing each transaction
  while (remaining--) {
    const outputs = [];

    let hasOpReturn = false;
    let isCoinbase = false;
    let isOverWitnessLimit = false;

    cursor += byteCountInt32;

    // SegWit transactions have a marker and flag following the version
    const isSegWit = buffer[cursor] === witnessMarkerValue &&
      buffer[cursor + 1] === witnessFlagValue;

    if (isSegWit) {
      cursor += byteCountMarkerFlag;
    }

    const inputsCount = readCount();

    for (let i = 0; i < inputsCount; i++) {
      const hash = buffer.subarray(cursor, cursor + byteCountHash);

      cursor += byteCountHash;

      const vout = buffer.readUInt32LE(cursor);

      cursor += byteCountInt32;

      // A coinbase input spends a null outpoint
      if (vout === coinbaseInputIndex && hash.every(n => !n)) {
        isCoinbase = true;
      }

      const scriptLength = readCount();

      cursor += scriptLength + byteCountInt32;
    }

    const outputsCount = readCount();

    for (let i = 0; i < outputsCount; i++) {
      const tokens = Number(buffer.readBigUInt64LE(cursor));

      cursor += byteCountInt64;

      const scriptLength = readCount();

      if (!!scriptLength && buffer[cursor] === opReturn) {
        hasOpReturn = true;
      }

      cursor += scriptLength;

      outputs.push(tokens);
    }

    // SegWit places a witness stack for every input after the outputs
    if (isSegWit) {
      for (let i = 0; i < inputsCount; i++) {
        const itemsCount = readCount();

        let witnessBytes = 0;

        for (let j = 0; j < itemsCount; j++) {
          const itemLength = readCount();

          cursor += itemLength;

          witnessBytes += itemLength;
        }

        if (witnessBytes > maxWitnessBytes) {
          isOverWitnessLimit = true;
        }
      }
    }

    cursor += byteCountInt32;

    // Exit early with error when the transaction runs past the block data
    if (cursor > buffer.length) {
      throw new Error('UnexpectedTransactionLengthInBlockToDeriveOutputs');
    }

    // Exit early when the transaction does not look like a regular payment
    if (isCoinbase || hasOpReturn || isOverWitnessLimit) {
      continue;
    }

    if (inputsCount > maxInputsCount || outputsCount !== paymentOutputsCount) {
      continue;
    }

    const tokens = outputs.filter(n => n > minTokens && n < maxTokens);

    // Exit early when no output is in the analyzed range
    if (!tokens.length) {
      continue;
    }

    transactions.push({outputs: tokens});
  }

  // Exit early with error when there is extra data after the transactions
  if (cursor !== buffer.length) {
    throw new Error('UnexpectedDataAfterBlockTransactionsToDeriveOutputs');
  }

  return {transactions};
};
