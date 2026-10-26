const yesOrNo = isYes => !!isYes ? 'yes' : 'no';

/** Describe whether the data support a compared price

  {
    [is_conflict]: <Supported Price Is At An Alias Ratio of Its Guide Bool>
    [is_supported]: <Derived Price Is Supported By the Data Bool>
    [windows]: [{
      is_supported: <Window Price Is Supported By the Data Bool>
      [is_widened]: <Search Was Widened Beyond the Price Window Bool>
    }]
  }

  @returns
  {
    support: <Support Description String>
  }
*/
module.exports = args => {
  // Exit early when the price would be refused for a conflict with its guide
  if (!!args.is_conflict) {
    return {support: 'conflict'};
  }

  // Exit early when the date was not estimated in windows
  if (!args.windows) {
    return {support: yesOrNo(args.is_supported)};
  }

  const counted = args.windows.filter(n => !!n.is_supported && !n.is_widened);

  const windows = `${counted.length}/${args.windows.length} windows`;

  return {support: `${yesOrNo(args.is_supported)}, ${windows}`};
};
