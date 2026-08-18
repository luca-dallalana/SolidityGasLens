// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Sample {
    uint256 public value;
    mapping(address => uint256) public balances;

    function setValue(uint256 newValue) public {
        value = newValue;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balances[to] += amount;
        return true;
    }

    function getValue() public view returns (uint256) {
        return value;
    }

    function sumAmounts(uint256[] calldata amounts) external pure returns (uint256 total) {
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
    }

    function hashOf(bytes32 h) public pure returns (bytes32) {
        return h;
    }

    function deposit(uint256 amount) external {
        require(amount > 0, "amount must be positive");
        value += amount;
    }

    function _internalHelper() internal pure returns (uint256) {
        return 42;
    }
}
