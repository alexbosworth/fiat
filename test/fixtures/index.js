const makeCandlesRequest = require('./make_candles_request');
const makeChain = require('./chain');
const makeFs = require('./make_fs');
const makeRecentChain = require('./make_recent_chain');
const makeReferenceRequest = require('./make_reference_request');
const makeStore = require('./make_store');
const referenceDay = require('./reference_day');

module.exports = {
  makeCandlesRequest,
  makeChain,
  makeFs,
  makeRecentChain,
  makeReferenceRequest,
  makeStore,
  referenceDay,
};
