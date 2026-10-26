const flatten = arr => [].concat(...arr);
const {log10} = Math;
const {round} = Math;
const uniq = arr => Array.from(new Set(arr));

/** Get the shifts in bins at which the round USD pattern lines up with itself

  {
    amounts: [<Round USD Amount Number>]
    bins_per_decade: <Bins Per Factor of Ten Number>
  }

  @returns
  {
    shifts: [<Alias Shift in Bins Number>]
  }
*/
module.exports = args => {
  // Shifting by the ratio between two amounts lands one amount on the other
  const ratios = flatten(args.amounts.map(amount => {
    return args.amounts.filter(n => n > amount).map(n => n / amount);
  }));

  // Convert each ratio to a distance in log-scale bins
  const shifts = ratios.map(ratio => {
    return round(log10(ratio) * args.bins_per_decade);
  });

  // A wrong price can look right at these partial self-match positions
  return {shifts: uniq(shifts).filter(n => !!n).sort((a, b) => a - b)};
};
