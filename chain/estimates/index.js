const currentEstimates = require('./current_estimates');
const estimateDayPrice = require('./estimate_day_price');
const estimateRecord = require('./estimate_record');
const forgetEstimates = require('./forget_estimates');
const getChainPrice = require('./get_chain_price');
const getPriceForDate = require('./get_price_for_date');
const isAliasRatio = require('./is_alias_ratio');
const isSupportedEstimate = require('./is_supported_estimate');
const nearestEstimate = require('./nearest_estimate');
const priceWindow = require('./price_window');
const rememberEstimate = require('./remember_estimate');

module.exports = {
  currentEstimates,
  estimateDayPrice,
  estimateRecord,
  forgetEstimates,
  getChainPrice,
  getPriceForDate,
  isAliasRatio,
  isSupportedEstimate,
  nearestEstimate,
  priceWindow,
  rememberEstimate,
};
