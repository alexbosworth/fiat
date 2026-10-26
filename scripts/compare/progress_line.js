const {stringify} = JSON;

/** Describe a line logged while comparing chain prices

  {
    line: <Logged Line Object>
  }

  @returns
  {
    text: <Line Text String>
  }
*/
module.exports = ({line}) => {
  // Exit early when the line is the progress of fetching blocks
  if (!!line.fetching_blocks) {
    const {blocks, date} = line.fetching_blocks;

    return {text: `  ${date} fetched ${blocks} blocks`};
  }

  // Exit early when a date is starting
  if (!!line.deriving_price_for) {
    return {text: `${line.deriving_price_for} deriving`};
  }

  // Exit early when a derivation starts from a day estimated on its own
  if (!!line.chain_price && !!line.chain_price.starting_from) {
    return {text: `  starting from ${line.chain_price.starting_from}`};
  }

  // Exit early when a price was derived on the way to a date
  if (!!line.chain_price) {
    const {date, is_sample, price} = line.chain_price;

    return {text: `  ${date} ${price}${!is_sample ? '' : ' from a sample'}`};
  }

  // Exit early when a starting day could not be priced on its own
  if (!!line.unsupported_starting_day) {
    return {text: `  ${line.unsupported_starting_day} is not supported alone`};
  }

  // Exit early when the reference of a day comes from CoinGecko
  if (!!line.reference_from_coingecko) {
    const {coinbase, date} = line.reference_from_coingecko;

    return {text: `  ${date} reference from CoinGecko, Coinbase: ${coinbase}`};
  }

  // Exit early when the line is not a comparison
  if (!line.compared) {
    return {text: stringify(line)};
  }

  const {compared} = line;

  // Exit early when the date could not be compared
  if (!!compared.error) {
    return {text: `${compared.date} ${compared.error[1]}`};
  }

  const price = compared.chain_price || 'no price';

  const notes = [
    !compared.difference ? undefined : compared.difference,
    !compared.guide_price ? undefined : `guided by ${compared.guide_price}`,
    !compared.is_widened ? undefined : 'widened',
    !compared.is_conflict ? undefined : 'conflict',
    !compared.is_unsupported ? undefined : 'unsupported',
    !compared.windows ? undefined : `windows ${compared.windows}`,
    !compared.sample_blocks ? undefined : `${compared.sample_blocks} blocks`,
    !compared.payments ? undefined : `${compared.payments} payments`,
  ]
  .filter(n => !!n);

  const against = `${price} against ${compared.reference_price}`;

  return {text: [`${compared.date} ${against}`].concat(notes).join(', ')};
};
