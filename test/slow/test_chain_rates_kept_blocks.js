const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const asyncMapSeries = require('async/mapSeries');
const asyncUntil = require('async/until');

const {makeChain} = require('./../fixtures');
const method = require('./../../chain/chain_rates');

const blocksPath = '/data/blocks.json';
const finalDay = 4;
const genesis = Date.parse('2030-01-01T00:00:00.000Z') / 1000;
const path = '/data/prices.json';

const {tip} = makeChain({genesis, tip_hours: 12});

// A first run prices today when the day is twelve hours along
const firstRun = {
  blocks: 206,
  kept: 206,
  prices: [5676454],
  reads: 1,
  writes: 1,
};

// An in-memory file system that counts reads and writes of the blocks file
const makeFs = args => {
  const counts = {reads: 0, writes: 0};

  const fs = {
    getFile: (path, cbk) => {
      counts.reads += path === blocksPath ? 1 : 0;

      if (!args.files[path]) {
        return cbk({code: 'ENOENT'});
      }

      return cbk(null, Buffer.from(args.files[path]));
    },
    makeDirectory: (path, cbk) => cbk(),
    renameFile: (from, to, cbk) => {
      if (to === blocksPath && !!args.is_saving_failing) {
        return cbk('err');
      }

      counts.writes += to === blocksPath ? 1 : 0;

      args.files[to] = args.files[from];

      delete args.files[from];

      return cbk();
    },
    writeFile: (path, contents, cbk) => {
      args.files[path] = contents;

      return cbk();
    },
  };

  return {counts, fs};
};

// Make LND fail, or stop answering, when getting blocks past a count of them
const limitBlocks = args => {
  const {getBlock} = args.chain.lnd.blocks;
  const limit = args.fail_after || args.hang_after;

  // Exit early when there is no limit to getting blocks
  if (!limit) {
    return args.chain;
  }

  args.chain.lnd.blocks.getBlock = (req, cbk) => {
    // Exit early when the block is within the limit
    if (args.chain.calls.blocks < limit) {
      return getBlock(req, cbk);
    }

    return !!args.fail_after ? cbk({details: 'err'}) : undefined;
  };

  return args.chain;
};

// The number of blocks in the blocks file
const keptCount = ({files}) => {
  // Exit early when there is no blocks file
  if (!files[blocksPath]) {
    return Number();
  }

  return JSON.parse(files[blocksPath]).blocks.length;
};

// Mark the blocks file as one kept by another version of the method
const markOtherMethod = ({files}) => {
  const file = JSON.parse(files[blocksPath]);

  file.method_version = 'other';

  files[blocksPath] = JSON.stringify(file);

  return;
};

// Price days in order, stopping at the first day that cannot be priced
const priceDays = ({dates, getChainRate}) => new Promise(resolve => {
  return asyncMapSeries(dates, (date, cbk) => {
    return getChainRate({date, currency: 'BTC', fiat: 'USD'}, cbk);
  },
  (err, res) => resolve(res.filter(n => !!n).map(n => n.cents)));
});

// Wait for the blocks file to be written, without waiting for any price
const savedBlocks = async ({files}) => {
  const isSaved = cbk => cbk(null, !!files[blocksPath]);

  await asyncUntil(isSaved, cbk => setImmediate(cbk));

  return [];
};

// Price days in a run of chain rates on a chain, sharing files with others
const priceRun = async ({files, run}) => {
  // A run can find a blocks file that another version of the method kept
  if (!!run.is_other_method) {
    markOtherMethod({files});
  }

  const chain = limitBlocks({
    chain: makeChain({
      genesis,
      time_shifts: run.time_shifts,
      tip_hours: run.tip_hours,
    }),
    fail_after: run.fail_after,
    hang_after: run.hang_after,
  });

  const {counts, fs} = makeFs({
    files,
    is_saving_failing: run.is_saving_failing,
  });

  const {getChainRate} = method({
    fs,
    path,
    blocks_path: !run.is_uncached ? blocksPath : undefined,
    lnd: chain.lnd,
  });

  const dates = (run.days || [finalDay]).map(day => chain.day(day));

  const pricing = priceDays({dates, getChainRate});

  // A run that stops getting answers for blocks never ends, but saves blocks
  const prices = !run.hang_after ? await pricing : await savedBlocks({files});

  return {
    prices,
    blocks: chain.calls.blocks,
    kept: keptCount({files}),
    reads: counts.reads,
    writes: counts.writes,
  };
};

// Price days in runs of chain rates, one run after another, sharing files
const runScenario = ({files, runs}) => {
  const shared = Object.assign({}, files);

  return asyncMapSeries(runs, async run => priceRun({run, files: shared}));
};

const tests = [
  {
    args: {runs: [{tip_hours: 12}, {tip_hours: 14}]},
    description: 'A later run only fetches the blocks that are new',
    expected: [
      firstRun,
      {blocks: 12, kept: 218, prices: [5677615], reads: 1, writes: 1},
    ],
  },
  {
    args: {runs: [{tip_hours: 12}, {is_uncached: true, tip_hours: 14}]},
    description: 'A run without kept blocks fetches the same blocks again',
    expected: [
      firstRun,
      {blocks: 74, kept: 206, prices: [5677615], reads: 0, writes: 0},
    ],
  },
  {
    args: {runs: [{tip_hours: 12}, {is_other_method: true, tip_hours: 14}]},
    description: 'Blocks kept by another version of the method are fetched',
    expected: [
      firstRun,
      {blocks: 74, kept: 74, prices: [5677615], reads: 1, writes: 1},
    ],
  },
  {
    args: {
      runs: [{tip_hours: 12}, {time_shifts: {[tip - 30]: 1}, tip_hours: 14}],
    },
    description: 'A kept block that the chain replaced is fetched again',
    expected: [
      firstRun,
      {blocks: 13, kept: 218, prices: [5677615], reads: 1, writes: 1},
    ],
  },
  {
    args: {
      runs: [
        {days: [finalDay, finalDay - 1], tip_hours: 12},
        {days: [finalDay - 1], tip_hours: 12},
      ],
    },
    description: 'The blocks file is only read and written when needed',
    expected: [
      {
        blocks: 206,
        kept: 206,
        prices: [5676454, 5556326],
        reads: 1,
        writes: 1,
      },
      {blocks: 0, kept: 206, prices: [5556326], reads: 0, writes: 0},
    ],
  },
  {
    args: {files: {[blocksPath]: 'not json'}, runs: [{tip_hours: 12}]},
    description: 'A damaged blocks file is replaced',
    expected: [firstRun],
  },
  {
    args: {runs: [{is_saving_failing: true, tip_hours: 12}]},
    description: 'A blocks file that cannot be saved does not stop a price',
    expected: [
      {blocks: 206, kept: 0, prices: [5676454], reads: 1, writes: 0},
    ],
  },
  {
    args: {runs: [{hang_after: 50, tip_hours: 12}, {tip_hours: 12}]},
    description: 'Blocks are saved as they are fetched',
    expected: [
      {blocks: 50, kept: 50, prices: [], reads: 1, writes: 1},
      {blocks: 156, kept: 206, prices: [5676454], reads: 1, writes: 1},
    ],
  },
  {
    args: {runs: [{fail_after: 20, tip_hours: 12}]},
    description: 'Blocks fetched for a price that failed are saved',
    expected: [{blocks: 20, kept: 20, prices: [], reads: 1, writes: 1}],
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    deepEqual(await runScenario(args), expected, 'Got expected runs');

    return;
  });
});
