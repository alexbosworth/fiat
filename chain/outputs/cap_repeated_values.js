const {isRoundTokens} = require('./../histogram');

const maxRepeats = 10;

/** Cap how many times any one exact amount of sats is counted

  {
    outputs: [<Output Tokens Number>]
  }

  @returns
  {
    outputs: [<Output Tokens Number>]
  }
*/
module.exports = ({outputs}) => {
  const counts = new Map();

  return {
    outputs: outputs.filter(tokens => {
      // Exit early when the amount is a round amount of BTC
      if (isRoundTokens({tokens}).is_round) {
        return true;
      }

      const count = (counts.get(tokens) || Number()) + 1;

      counts.set(tokens, count);

      return count <= maxRepeats;
    }),
  };
};
