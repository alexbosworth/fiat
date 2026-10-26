const EventEmitter = require('events');
const http = require('http');
const {homedir} = require('os');
const {join} = require('path');
const {readFileSync} = require('fs');

const bufferAsHex = buffer => buffer.toString('hex');
const callTimeoutMs = 60000;
const {env} = process;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const macDataDirectory = 'Library/Application Support/Bitcoin';
const mainnet = 'main';
const {parse} = JSON;
const retryDelaysMs = [1000, 5000, 15000, 30000, 60000];
const {stringify} = JSON;
const unixDataDirectory = '.bitcoin';

/** Make a stand-in for LND that answers from a local Bitcoin Core

  {}

  @returns via Promise
  {
    height: <Chain Tip Height Number>
    lnd: <LND Stand-In Object>
  }
*/
module.exports = async ({}) => {
  const agent = new http.Agent({keepAlive: true, maxSockets: 8});
  const url = new URL(env.BITCOIN_RPC_URL || 'http://127.0.0.1:8332');

  const isMac = process.platform === 'darwin';

  const directory = isMac ? macDataDirectory : unixDataDirectory;

  const dataDirectory = join(homedir(), directory);

  // The credentials are read for every call in case the node restarts
  const credentials = () => {
    if (!!env.BITCOIN_RPC_USER) {
      return `${env.BITCOIN_RPC_USER}:${env.BITCOIN_RPC_PASSWORD || ''}`;
    }

    const cookie = env.BITCOIN_RPC_COOKIE || join(dataDirectory, '.cookie');

    return readFileSync(cookie, 'utf8').trim();
  };

  // Call a Bitcoin Core RPC method
  const call = (method, params) => new Promise((resolve, reject) => {
    const body = stringify({method, params, id: method, jsonrpc: '1.0'});

    const req = http.request({
      agent,
      auth: credentials(),
      headers: {
        'content-length': Buffer.byteLength(body),
        'content-type': 'application/json',
      },
      hostname: url.hostname,
      method: 'POST',
      path: url.pathname,
      port: url.port || 80,
    },
    res => {
      const chunks = [];

      res.on('data', chunk => chunks.push(chunk));

      res.on('error', reject);

      res.on('end', () => {
        try {
          const {error, result} = parse(Buffer.concat(chunks));

          if (!!error) {
            return reject(new Error(`${method}: ${error.message}`));
          }

          return resolve(result);
        } catch (err) {
          return reject(new Error(`${method}: HTTP ${res.statusCode}`));
        }
      });
    });

    // A call that gets no answer is given up on rather than waited on
    req.setTimeout(callTimeoutMs, () => {
      return req.destroy(new Error(`${method}: no answer from the node`));
    });

    req.on('error', reject);

    return req.end(body);
  });

  // Call a method, trying again after longer pauses each time it fails
  const callWithRetries = (method, params) => {
    return retryDelaysMs.reduce((attempt, delayMs) => {
      return attempt.catch(() => {
        return new Promise(resolve => setTimeout(resolve, delayMs))
          .then(() => call(method, params));
      });
    },
    call(method, params));
  };

  // Answer an LND style call from the node
  const answer = (read, cbk) => {
    return read().then(
      res => cbk(null, res),
      err => cbk({details: err.message})
    );
  };

  const info = await callWithRetries('getblockchaininfo', []);

  if (info.chain !== mainnet) {
    throw new Error(`ExpectedMainnetNodeButNodeIsOn ${info.chain}`);
  }

  const lnd = {
    blocks: {
      getBlock: (args, cbk) => answer(async () => {
        const hash = bufferAsHex(args.block_hash);

        const block = await callWithRetries('getblock', [hash, 0]);

        return {raw_block: hexAsBuffer(block)};
      },
      cbk),
      getBlockHash: (args, cbk) => answer(async () => {
        const height = args.block_height;

        const hash = await callWithRetries('getblockhash', [height]);

        return {block_hash: hexAsBuffer(hash)};
      },
      cbk),
      getBlockHeader: (args, cbk) => answer(async () => {
        const hash = bufferAsHex(args.block_hash);

        const header = await callWithRetries('getblockheader', [hash, false]);

        return {raw_block_header: hexAsBuffer(header)};
      },
      cbk),
    },
    chain: {
      registerBlockEpochNtfn: ({}) => {
        const emitter = new EventEmitter();

        emitter.cancel = () => {};

        // The chain tip is sent as the first block notification
        callWithRetries('getblockchaininfo', [])
          .then(tip => {
            const hash = hexAsBuffer(tip.bestblockhash);

            return emitter.emit('data', {hash, height: tip.blocks});
          })
          .catch(err => emitter.emit('error', {details: err.message}));

        return emitter;
      },
    },
  };

  return {lnd, height: info.blocks};
};
