const {tokensPerBigUnit} = require('./../constants');

const {log10} = Math;

/** Get the histogram bin where one dollar lands at a price

  {
    bins_per_decade: <Bins Per Factor of Ten Number>
    price: <USD Price Number>
  }

  @returns
  {
    bin: <Fractional Bin Where One Dollar Lands Number>
  }
*/
module.exports = args => {
  return {bin: args.bins_per_decade * log10(tokensPerBigUnit / args.price)};
};
