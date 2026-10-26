# Fiat Methods

Methods for working with fiat prices.

`chainRates` derives prices from chain data alone; how and why is described in
[docs/METHODOLOGY.md](docs/METHODOLOGY.md). The prices of the days up to a
release ship with the package in `chain/known/known_prices.json`.

## `chainRates`

Make a method that gets historic USD prices of BTC from chain data

    {
      fs: {
        getFile: <Read File Contents Function> (path, cbk) => {}
        makeDirectory: <Make Directory Function> (path, cbk) => {}
        renameFile: <Rename File Function> (from, to, cbk) => {}
        writeFile: <Write File Contents Function> (path, contents, cbk) => {}
      }
      lnd: <Authenticated LND API Object>
      [logger]: <Winston Logger Object>
      path: <Prices File Path String>
    }

    @throws
    <Error>

    @returns
    {
      getChainRate: <Get Chain Rate Method> ({
        currency: <Currency To Price String> // BTC
        date: <Date To Price ISO 8601 Date String> // priced on its day in UTC
        fiat: <Fiat Currency To Price In String> // USD
      }, cbk) => (err, {
        cents: <US Cents Per BTC on the Day of the Date Number>
      })
    }

## `getPrices`

Get exchange rates from a rate provider

    {
      [date]: <Rates At the Hour of ISO 8601 Date String>
      from: <From Rate Provider String>
      request: <Request Function> {url}, (err, {statusCode}, body) => {}
      symbols: [<Fiat Symbol String>] // empty defaults to USD
    }

    @returns via cbk or Promise
    {
      tickers: [{
        date: <Rate Updated At or Hour Priced At ISO 8601 Date String>
        rate: <Exchange Rate in Cents Number>
        ticker: <Ticker Symbol String>
      }]
    }

## Scripts

- `npm test` runs the quick tests and reports their coverage
- `npm run test-all` also runs the slower tests in `test/slow`, which derive
    prices from simulated chains, and reports the coverage of all the tests
- `npm run check-prices` compares chain prices with the hourly prices of days
    on Coinbase Exchange, with the options described under Validation in the
    methodology. Without days it checks the latest three complete days, or as
    many as `--days`
- `npm run update-known-prices` brings the shipped prices up to date, as
    described under Releasing
- `npm publish` first runs `scripts/check_known_prices.js`, which stops the
    publish when the shipped prices are not ready for a release

For example, to compare two days priced without a neighboring price as a
guide:

    npm run check-prices -- 2024-08-05 2024-08-08 --unguided

The scripts that read the chain reach Bitcoin Core at `http://127.0.0.1:8332`
with the cookie in the default data directory, or as set by `BITCOIN_RPC_URL`,
`BITCOIN_RPC_COOKIE`, or `BITCOIN_RPC_USER` and `BITCOIN_RPC_PASSWORD`.

## Releasing

A release normally ships the prices of the days up to it, so that lookups of
those days do not have to derive them from the chain:

1. With Bitcoin Core synced, run `npm run update-known-prices`. It derives
    the prices of the last week of shipped days again, which have to come out
    the same, and then adds a price for every complete day after them. Each
    new price has to be within the range its day traded in on Coinbase
    Exchange and within 5% of the median of its hourly prices there, and a day
    that fails a check stops the run without changing the table
2. Look over the summary at the end of the run, which shows how far the new
    prices are from the median of the hourly prices of their days. A higher
    median or 95th percentile, or a bias, means the prices agree with the
    exchange less well than before, even though every day passed its checks
3. Run `npm run test-all`, which includes the slow tests that `npm test`
    leaves out
4. Commit `chain/known/known_prices.json` with the release
5. Run `npm publish`, which checks that the shipped prices are of the current
    version of the method, start on the earliest supported day, have a price
    for every day and reach to within a week of the present, and stops when
    they don't

When the method changes version, every day is derived again, which takes
several hours, and the summary also shows how far the prices moved from the
last table.

To release without new prices, publish with `npm publish --ignore-scripts`,
which skips the check. The table still has to be of the current version of
the method, since prices of another version are not used, so first run
`node scripts/check_known_prices.js` and see that the age of the prices is the
only problem it reports. Lookups of the days after the last shipped price then
derive them from the chain.
