# Fiat Methods

Methods for working with fiat prices.

## `getPrices`

Get exchange rates from a rate provider

    {
      from: <From Rate Provider String>
      request: <Request Function> {url}, (err, {statusCode}, body) => {}
      symbols: [<Fiat Symbol String>] // empty defaults to USD
    }

    @returns via cbk or Promise
    {
      tickers: [{
        date: <Rate Updated At ISO 8601 Date String>
        rate: <Exchange Rate in Cents Number>
        ticker: <Ticker Symbol String>
      }]
    }
