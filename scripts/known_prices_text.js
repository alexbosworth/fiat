const indent = 2;
const {keys} = Object;
const {stringify} = JSON;

/** Write prices of days as the JSON text of a known prices file

  {
    rates: {<Day YYYY-MM-DD String>: {cents: <USD Cents Number>}}
    version: <Method Version String>
  }

  @returns
  {
    text: <Known Prices JSON Text String>
  }
*/
module.exports = ({rates, version}) => {
  const prices = {};

  // The days are written in order, one to a line
  keys(rates).sort().forEach(day => prices[day] = rates[day].cents);

  return {text: `${stringify({prices, version}, null, indent)}\n`};
};
