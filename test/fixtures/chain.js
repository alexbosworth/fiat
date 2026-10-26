const EventEmitter = require('events');
const {createHash} = require('crypto');

const {numberAsCompactInt} = require('@alexbosworth/blockchain');

const blockHeaderByteLength = 80;
const blockInterval = 600;
const dayLength = 'yyyy-mm-dd'.length;
const defaultDays = 4;
const defaultPaymentsPerBlock = 50;
const defaultPriceJitter = 0.01;
const defaultPrices = [40123, 42345, 57890, 55555, 56789];
const defaultTipHours = 20;
const defaultGenesis = Date.parse('2024-01-01T00:00:00.000Z') / 1000;
const msPerSecond = 1000;
const secondsPerDay = 60 * 60 * 24;
const secondsPerHour = 60 * 60;
const spikeWeights = {10: 6, 20: 5, 50: 10, 100: 14, 200: 6, 500: 7, 1000: 8};
const timeOffset = 68;
const tokensPerBigUnit = 1e8;
const varint = n => numberAsCompactInt({number: n}).encoded;

// Round USD amounts to pay, repeated according to how common they are
const spikeAmounts = weights => Object.keys(weights).reduce((amounts, usd) => {
  return amounts.concat(Array(weights[usd]).fill(Number(usd)));
},
[]);

const uint32 = n => {
  const buffer = Buffer.alloc(4);

  buffer.writeUInt32LE(n);

  return buffer;
};

const uint64 = n => {
  const buffer = Buffer.alloc(8);

  buffer.writeBigUInt64LE(BigInt(n));

  return buffer;
};

// Deterministic pseudo random numbers
const makeRandom = seed => () => {
  seed |= 0;
  seed = seed + 0x6D2B79F5 | 0;

  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);

  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;

  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

const script = n => Buffer.concat([Buffer.from([0, 20]), Buffer.alloc(20, n)]);

// Serialize a simple transaction with one input and some outputs
const makeTx = ({hash, values}) => Buffer.concat([
  uint32(2),
  varint(1), hash, uint32(0), varint(0), uint32(0xffffffff),
  varint(values.length),
  ...values.map((v, i) => Buffer.concat([uint64(v), varint(22), script(i)])),
  uint32(0),
]);

/** Make a simulated chain of payments with a mock LND to access it

  Blocks are every ten minutes starting at the start of 2024, or at another
  start, and the price changes day by day, and through each day when asked.
  Each payment is made at a price up to 1% off the price of the moment, or by
  as much as the jitter given, so that payments of the same round amount
  rarely come to exactly the same value.

  {
    [day_spike_weights]: {
      <Day Index Number>: {<Round USD Amount String>: <Frequency Number>}
    }
    [days]: <Days of Blocks Before the Final Day Number>
    [empty_days]: [<Day Without Any Payments Index Number>]
    [genesis]: <First Block Time Epoch Seconds Number>
    [hourly_moves]: [<Price Change In Hour of Each Day Fraction Number>]
    [payments_per_block]: <Payments Per Block Number>
    [price_jitter]: <Largest Change of Price Between Payments Fraction Number>
    [prices]: [<USD Price On Day Number>]
    [quiet_days]: [<Day Without Round USD Payments Index Number>]
    [spike_weights]: {<Round USD Amount String>: <Relative Frequency Number>}
    [time_shifts]: {<Block Height Number>: <Timestamp Off By Seconds Number>}
    [tip_hours]: <Hours Into the Final Day of the Chain Tip Number>
  }

  @returns
  {
    calls: {blocks: <Blocks Retrieved Count Number>}
    day: <Function> (n) => <Day n ISO 8601 Date String>
    day_name: <Function> (n) => <Day n YYYY-MM-DD String>
    lnd: <Mock Authenticated LND API Object>
    prices: {<Day YYYY-MM-DD String>: <USD Price Number>}
    tip: <Chain Tip Height Number>
  }
*/
module.exports = args => {
  const calls = {blocks: Number()};
  const days = args.days || defaultDays;
  const genesis = args.genesis || defaultGenesis;
  const hourlyMoves = args.hourly_moves || [];
  const paymentsPerBlock = args.payments_per_block || defaultPaymentsPerBlock;
  const hasJitter = args.price_jitter !== undefined;

  const empty = (args.empty_days || []).map(n => n * secondsPerDay + genesis);
  const priceJitter = hasJitter ? args.price_jitter : defaultPriceJitter;
  const prices = {};
  const quiet = (args.quiet_days || []).map(n => n * secondsPerDay + genesis);
  const spikes = spikeAmounts(args.spike_weights || spikeWeights);
  const daySpikes = args.day_spike_weights || {};
  const hasTipHours = args.tip_hours !== undefined;
  const timeShifts = args.time_shifts || {};

  const tipHours = hasTipHours ? args.tip_hours : defaultTipHours;

  const dayOf = time => new Date(time * msPerSecond).toISOString();
  const timeAt = height => genesis + height * blockInterval;

  const dayName = time => dayOf(time).substring(Number(), dayLength);

  (args.prices || defaultPrices).forEach((price, i) => {
    prices[dayName(genesis + i * secondsPerDay)] = price;
  });

  // Some days can have round payments of their own amounts
  const spikesOnDay = Object.keys(daySpikes).reduce((sum, index) => {
    const day = dayName(genesis + Number(index) * secondsPerDay);

    sum[day] = spikeAmounts(daySpikes[index]);

    return sum;
  },
  {});

  const tip = (days * secondsPerDay + tipHours * 60 * 60) / blockInterval;

  const makeHeader = height => {
    const header = Buffer.alloc(blockHeaderByteLength);

    // A block can be stamped with a time that is off from when it was mined
    const time = timeAt(height) + (timeShifts[height] || Number());

    header.writeUInt32LE(time, timeOffset);

    return header;
  };

  // Make a block full of payments at the price of the day
  const makeBlock = height => {
    const isEmpty = empty.map(dayName).includes(dayName(timeAt(height)));
    const isQuiet = quiet.map(dayName).includes(dayName(timeAt(height)));
    const hour = Math.floor(timeAt(height) % secondsPerDay / secondsPerHour);

    const move = hourlyMoves[hour] || Number();

    // The price can move away from the day price during some hours of a day
    const price = prices[dayName(timeAt(height))] * (1 + move);
    const random = makeRandom(height);
    const txs = [makeTx({hash: Buffer.alloc(32), values: [312500000]})];

    const usdToTokens = usd => Math.round(usd / price * tokensPerBigUnit);

    // A block on an empty day only has its coinbase transaction
    [...Array(isEmpty ? Number() : paymentsPerBlock).keys()].forEach(i => {
      const hash = createHash('sha256').update(`${height}:${i}`).digest();
      const isSpike = random() < 0.5 && !isQuiet;

      const amounts = spikesOnDay[dayName(timeAt(height))] || spikes;

      const spike = amounts[(height * paymentsPerBlock + i) % amounts.length];

      const usd = isSpike ? spike : 30 + random() * 300;

      const change = usdToTokens(30 + random() * 300);

      // A payment can be made at a price a little off the price of the day
      const jitter = !priceJitter ? 1 : 1 + priceJitter * (2 * random() - 1);

      const paid = Math.round(usd / (price * jitter) * tokensPerBigUnit);

      txs.push(makeTx({hash, values: [paid, change]}));
    });

    return Buffer.concat([makeHeader(height), varint(txs.length), ...txs]);
  };

  const hashFor = height => {
    const hash = Buffer.alloc(32);

    hash.writeUInt32LE(height, 0);

    return hash;
  };

  const lnd = {
    blocks: {
      getBlock: (args, cbk) => {
        calls.blocks++;

        const height = args.block_hash.readUInt32LE(0);

        return cbk(null, {raw_block: makeBlock(height)});
      },
      getBlockHash: (args, cbk) => {
        return cbk(null, {block_hash: hashFor(args.block_height)});
      },
      getBlockHeader: (args, cbk) => {
        const height = args.block_hash.readUInt32LE(0);

        return cbk(null, {raw_block_header: makeHeader(height)});
      },
    },
    chain: {
      registerBlockEpochNtfn: ({}) => {
        const emitter = new EventEmitter();

        emitter.cancel = () => {};

        process.nextTick(() => {
          return emitter.emit('data', {hash: hashFor(tip), height: tip});
        });

        return emitter;
      },
    },
  };

  return {
    calls,
    lnd,
    prices,
    tip,
    day: n => dayOf(genesis + n * secondsPerDay),
    day_name: n => dayName(genesis + n * secondsPerDay),
  };
};
