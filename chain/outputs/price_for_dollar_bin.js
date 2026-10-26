const {tokensPerBigUnit} = require('./../constants');

const {pow} = Math;

/** Get the USD price at which one dollar lands in a histogram bin

  {
    bin: <Fractional Bin Where One Dollar Lands Number>
    bins_per_decade: <Bins Per Factor of Ten Number>
  }

  @returns
  {
    price: <USD Price Number>
  }
*/
module.exports = args => {
  const decades = args.bin / args.bins_per_decade;

  return {price: tokensPerBigUnit / pow(10, decades)};
};
