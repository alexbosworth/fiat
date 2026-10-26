const {roundTokensMultiple} = require('./../constants');

const roundMantissas = [1, 2, 5];

/** Determine if a tokens amount is a round amount of BTC

  {
    tokens: <Tokens Number>
  }

  @returns
  {
    is_round: <Tokens Are A Round Amount Bool>
  }
*/
module.exports = ({tokens}) => {
  // Exit early when the amount is a multiple of a thousand sats
  if (!(tokens % roundTokensMultiple)) {
    return {is_round: true};
  }

  // Smaller amounts are round as a one, two or five followed by zeros
  const digits = String(tokens).replace(/0+$/, '');

  return {is_round: roundMantissas.includes(Number(digits))};
};
