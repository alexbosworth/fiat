/** Summarize how many of the windows of a day were supported

  {
    [windows]: [{
      is_supported: <Window Price Is Supported By the Data Bool>
      [is_widened]: <Search Was Widened Beyond the Price Window Bool>
    }]
  }

  @returns
  {
    [summary]: <Supported Windows Out Of All Windows String>
  }
*/
module.exports = ({windows}) => {
  // Exit early when the day was not estimated in windows
  if (!windows) {
    return {};
  }

  const supported = windows.filter(n => !!n.is_supported && !n.is_widened);

  return {summary: `${supported.length} of ${windows.length} supported`};
};
