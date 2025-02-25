const ethers = require('ethers');

const { getEvents, getTraces } = require('./queries');
const aggregators = require('./aggregators');
const { nftTransferEvents } = require('../../utils/params');

const parseEventWyvern = async (
  task,
  startBlock,
  endBlock,
  abi,
  config,
  parse
) => {
  // read events from db
  const events = await getEvents(task, startBlock, endBlock, config);
  if (!events.length) return [];

  // instantiate abi interface
  const interface = new ethers.Interface(abi);
  for (const e of config.events) {
    config[e.signatureHash] = e.name;
  }

  const marketplaceEvents = events.filter((e) =>
    config.events.map((ev) => ev.signatureHash).includes(`0x${e.topic_0}`)
  );

  // traces are required to calc royalty fee in the context of
  // tx originating from aggregators (the trace contains the individual os wallet amount.
  // filter the mplace event array to aggregator events only
  const aggregatorTransactions = marketplaceEvents.filter(
    (i) => !config.contracts.includes(`0x${i.to_address}`)
  );
  const traces = aggregatorTransactions.length
    ? await getTraces(task, startBlock, endBlock, config, [
        ...new Set(aggregatorTransactions.map((i) => i.transaction_hash)),
      ])
    : [];

  // will be empty for all marketplace for which we don't read nft transfer events
  const transferEvents = events.filter((e) =>
    Object.values(nftTransferEvents).includes(e.topic_0)
  );

  const aggregatorContracts = aggregators.flatMap((agg) =>
    agg.contracts.map((c) => c.toLowerCase())
  );

  // parse event data
  const parsedEvents = await Promise.all(
    marketplaceEvents.map(async (event) => {
      const data = `0x${event.data}`;
      const topics = [
        event.topic_0,
        event.topic_1,
        event.topic_2,
        event.topic_3,
      ]
        .filter(Boolean)
        .map((t) => `0x${t}`);

      const decodedEvent = interface.decodeEventLog(topics[0], data, topics);

      let trace = {};
      if (traces.length) {
        const sortedEvents = marketplaceEvents
          .filter((e) => e.transaction_hash === event.transaction_hash)
          .sort((a, b) => a.log_index - b.log_index);

        const sortedTraces = traces
          .filter((tr) => tr.transaction_hash === event.transaction_hash)
          .sort((a, b) => a.trace_index - b.trace_index);

        const idx = sortedEvents.findIndex(
          (i) => i.log_index === event.log_index
        );
        trace = sortedTraces[idx];
      }

      const parsedEvent = await parse(
        decodedEvent,
        event,
        transferEvents,
        interface,
        trace
      );

      if (Object.keys(parsedEvent).length === 0) {
        return {};
      }

      // check if aggregator tx
      const aggregator = aggregators.find((agg) =>
        agg.contracts
          .map((i) => i.toLowerCase())
          .includes(`0x${event.to_address}`)
      );
      const aggregatorName =
        (event?.aggregator_name || aggregator?.name) ?? null;
      const aggregatorAddress =
        aggregator !== undefined ? event.to_address : null;

      // keeping a bunch of fields from event_logs
      const {
        topic_1,
        topic_2,
        topic_3,
        data: dataEncoded,
        price,
        tx_data,
        block_hash,
        aggregator_name,
        ...rest
      } = event;

      // for opensea wyvern bundle trades only (==array of objects instead of single object)
      if (parsedEvent.length) {
        return parsedEvent.map((e) => {
          return {
            ...rest,
            ...e,
            buyer: aggregatorContracts.includes(e.buyer?.toLowerCase())
              ? event.from_address
              : e.buyer,
            exchangeName: config.exchangeName,
            aggregatorName,
            aggregatorAddress,
          };
        });
      }

      return {
        ...rest,
        ...parsedEvent,
        buyer: aggregatorContracts.includes(parsedEvent.buyer?.toLowerCase())
          ? event.from_address
          : parsedEvent.buyer,
        exchangeName: config.exchangeName,
        aggregatorName,
        aggregatorAddress,
      };
    })
  );

  // remove empty objects
  return parsedEvents.flat().filter((event) => event.collection);
};

module.exports = parseEventWyvern;
