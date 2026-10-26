# Versions

## 3.0.0

- Add `chainRates` to make a `getChainRate` method that gets the USD price of
    BTC in cents on the day of a date from chain data via LND, for dates from
    October 20, 2021, pricing each day as the time weighted median of windows
    of about two hours of its blocks and refusing a day whose price the data do
    not support rather than guessing, answering the days up to the release from
    prices shipped with the package and keeping derived prices in a versioned
    prices file that records how every price was derived, along with the
    provisional price of the current day, which is reused for about an hour,
    removing a stored price for good once a reorganization replaces its blocks,
    and keeping a stored price from blocks that LND has not reached yet, as
    when it is catching up after being down
- Add `date` to `getPrices` to get the rates at the hour of a date from
    Coinbase Exchange, in USD, EUR or GBP, back to 2015 without an API key,
    fetching the hourly prices of a day once for all of its dates when the same
    request function is used

### Breaking Changes

- Require node.js 22 or higher

## 2.0.0

- Require node.js 16 or higher

## 1.0.4

- Add `getPrices` method to get fiat prices
