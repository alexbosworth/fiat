const makeChain = require('./chain');

const daysBack = 10;
const secondsPerDay = 60 * 60 * 24;

// Chains made in one run all start on the same day
const today = Math.floor(Date.now() / 1000 / secondsPerDay);

/** Make a simulated chain that starts ten days ago

  Reference providers only serve days that have happened, so a chain whose
  prices are compared with them starts in the recent past.

  {
    [<Chain Fixture Argument>]: <Chain Fixture Argument Value>
  }

  @returns
  <Chain Fixture Object>
*/
module.exports = args => makeChain(Object.assign({}, args, {
  genesis: (today - daysBack) * secondsPerDay,
}));
