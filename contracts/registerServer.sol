// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract registerServer {
    struct User {
        string username;
        address userAddress;
    }

    mapping(address => User) public users;
    address public admin;

    constructor() {
        admin = msg.sender; // The deployer is the admin
    }

    function registerUser(string calldata username) public {
        require(bytes(users[msg.sender].username).length == 0, "User already registered.");
        users[msg.sender] = User(username, msg.sender);
    }

    function getUser(address userAddress) public view returns (string memory, address) {
        require(bytes(users[userAddress].username).length > 0, "User not registered.");
        return (users[userAddress].username, users[userAddress].userAddress);
    }
}
