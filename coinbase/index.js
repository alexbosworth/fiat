const getCoinbaseCurrentPrice = require('./get_coinbase_current_price');
const getCoinbaseDayCandles = require('./get_coinbase_day_candles');
const getCoinbaseHistoricPrice = require('./get_coinbase_historic_price');

module.exports = {
  getCoinbaseCurrentPrice,
  getCoinbaseDayCandles,
  getCoinbaseHistoricPrice,
};
