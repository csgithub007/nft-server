const yargs = require('yargs');

const { getMaxBlock } = require('./trades/queries');
const { blockRangeTest } = require('../utils/params');
const { indexa } = require('../utils/dbConnection');

const argv = yargs.options({
  etype: {
    alias: 'e',
    type: 'string',
    demandOption: true,
    describe: 'event type, eg trades',
    choices: ['trades', 'transfers', 'history'],
  },
  marketplace: {
    alias: 'm',
    type: 'string',
    demandOption: true,
    describe: 'adapter name, eg blur',
  },
  block: {
    alias: 'b',
    type: 'number',
    demandOption: false,
  },
  blockRange: {
    alias: 'r',
    type: 'number',
    demandOption: false,
  },
  txHash: {
    alias: 'h',
    type: 'string',
    demandOption: false,
    describe: 'transaction_hash',
  },
}).argv;

(async () => {
  const etype = argv.etype;
  const marketplace = argv.marketplace;
  const block = argv.block;
  const blockRange = argv.blockRange;
  const txHash = argv.txHash;

  console.log(`==== Testing ${etype}:${marketplace} ====`);

  const time = () => Date.now() / 1000;
  const start = time();

  const { abi, config, parse } =
    etype !== 'transfers'
      ? require(`./${etype}/${marketplace}`)
      : { undefined, undefined, undefined };

  const parseEvent =
    etype === 'trades' && config.version === 'wyvern'
      ? require(`./${etype}/parseEventWyvern`)
      : require(`./${etype}/parseEvent`);

  const endBlock = !block
    ? await indexa.task(async (t) => {
        return await getMaxBlock(t, 'ethereum.event_logs');
      })
    : block;

  const startBlock = endBlock - (blockRange ?? blockRangeTest);

  const pEvents = await indexa.task(async (t) => {
    return await parseEvent(t, startBlock, endBlock, abi, config, parse);
  });

  console.log(pEvents);
  console.log(`\nRuntime: ${(time() - start).toFixed(2)} sec`);
  console.log(
    `${pEvents.length} parsed events in blocks ${startBlock}-${endBlock}`
  );

  if (txHash) {
    console.log('\nresult for txHash:');
    console.log(
      pEvents.filter((e) => e.transaction_hash === txHash.replace('0x', ''))
    );
  }

  process.exit(0);
})();
