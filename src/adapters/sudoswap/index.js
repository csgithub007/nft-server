const { stripZerosLeft } = require('ethers');

const abi = require('./abi.json');
const config = require('./config.json');

const parse = (decodedData, event, events, interface, trace, traces) => {
  const paymentToken = '0x0000000000000000000000000000000000000000'; // eth only
  const amount = 1; // erc721 only; each sale will be in separate object

  const transfers = events.filter(
    (e) => e.transaction_hash === event.transaction_hash
  );

  // if tx originated from aggregator than the nft transfer events (events array) won't be limited
  // to sudoswap but to whatever marketplaces the sales were made.
  // we filter the events array to sudoswap related ones only
  const sudoContract = event.contract_address;
  const eventsSudo = transfers.filter(
    (e) => e.topic_1.includes(sudoContract) || e.topic_2.includes(sudoContract)
  );

  const nbEvents = transfers.length;
  const nbEventsSudo = eventsSudo.length;

  console.log(nbEvents, nbEventsSudo);
  console.log(event);
  console.log(trace);
  console.log(traces.length);
  process.exit();

  const pairRouter = '2b2e8cda09bba9660dca5cb6233787738ad68329';
  return eventsSudo.map((e) => {
    const seller = stripZerosLeft(`0x${e.topic_1}`);
    const buyer = stripZerosLeft(`0x${e.topic_2}`);

    // sudo v1: erc721 only
    const collection = e.contract_address;
    const tokenId = BigInt(`0x${e.topic_3}`);

    let salePrice;
    let ethSalePrice;
    let usdSalePrice;

    // if events array contains non sudo transfers -> aggregator tx
    // -> we get the sale price from the trace array
    if (nbEvents > nbEventsSudo) {
      salePrice = ethSalePrice =
        traces.find(
          (t) => t.to_address === pairRouter || t.from_address === sudoContract
        ).value / 1e18;
      usdSalePrice = ethSalePrice * event.price;
    } else {
      // in case of tx directly on sudoswap (scale trace price by nb of tokens)
      salePrice = (ethSalePrice = trace.value / 1e18) / nbEventsSudo;
      usdSalePrice = ethSalePrice * event.price;
    }

    return {
      collection,
      tokenId,
      amount,
      salePrice,
      ethSalePrice,
      usdSalePrice,
      paymentToken,
      seller,
      buyer,
    };
  });
};

module.exports = { abi, config, parse };
