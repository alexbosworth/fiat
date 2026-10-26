const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../scripts/compare/progress_line');

const tests = [
  {
    args: {line: {fetching_blocks: {blocks: '24/144', date: '2024-01-01'}}},
    description: 'The progress of fetching blocks is shown',
    expected: {text: '  2024-01-01 fetched 24/144 blocks'},
  },
  {
    args: {line: {deriving_price_for: '2024-01-01'}},
    description: 'The start of a date is shown',
    expected: {text: '2024-01-01 deriving'},
  },
  {
    args: {line: {chain_price: {starting_from: '2024-01-02'}}},
    description: 'The day a derivation starts from is shown',
    expected: {text: '  starting from 2024-01-02'},
  },
  {
    args: {line: {chain_price: {date: '2024-01-02', price: '1.00'}}},
    description: 'A price derived on the way is shown',
    expected: {text: '  2024-01-02 1.00'},
  },
  {
    args: {
      line: {
        chain_price: {date: '2024-01-02', is_sample: true, price: '1.00'},
      },
    },
    description: 'A price from a sample is shown as one',
    expected: {text: '  2024-01-02 1.00 from a sample'},
  },
  {
    args: {line: {unsupported_starting_day: '2024-01-02'}},
    description: 'A starting day without support is shown',
    expected: {text: '  2024-01-02 is not supported alone'},
  },
  {
    args: {
      line: {reference_from_coingecko: {coinbase: 'Err', date: '2024-01-01'}},
    },
    description: 'A reference from CoinGecko is shown',
    expected: {text: '  2024-01-01 reference from CoinGecko, Coinbase: Err'},
  },
  {
    args: {line: {other: 1}},
    description: 'Another line is shown as it is',
    expected: {text: '{"other":1}'},
  },
  {
    args: {line: {compared: {date: '2024-01-01', error: [503, 'Failed']}}},
    description: 'A date that could not be compared shows why',
    expected: {text: '2024-01-01 Failed'},
  },
  {
    args: {
      line: {
        compared: {
          chain_price: '1.01',
          date: '2024-01-01',
          difference: '1.00%',
          payments: 100,
          reference_price: '1.00',
        },
      },
    },
    description: 'A comparison is shown',
    expected: {text: '2024-01-01 1.01 against 1.00, 1.00%, 100 payments'},
  },
  {
    args: {
      line: {
        compared: {
          date: '2024-01-01',
          guide_price: '2.00',
          is_conflict: true,
          is_unsupported: true,
          is_widened: true,
          reference_price: '1.00',
          sample_blocks: 24,
          windows: '1 of 12 supported',
        },
      },
    },
    description: 'A comparison shows how the date was estimated',
    expected: {
      text: [
        '2024-01-01 no price against 1.00',
        'guided by 2.00',
        'widened',
        'conflict',
        'unsupported',
        'windows 1 of 12 supported',
        '24 blocks',
      ]
      .join(', '),
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(method(args), expected, 'Got expected text');

    return;
  });
});
