// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Sample.sol";

contract SampleTest {
    Sample sample;

    function testSetValue() public {
        sample.setValue(42);
    }

    function testTransfer() public {
        sample.transfer(address(0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef), 100);
    }

    function testDeposit() public {
        sample.deposit(5);
    }
}
