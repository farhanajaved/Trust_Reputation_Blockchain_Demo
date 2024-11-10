// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract WeightSubmission {
    // Maximum number of rounds
    uint8 public constant maxRounds = 50;
    
    // Mapping to store the weights with client addresses for each round
    mapping(uint8 => mapping(address => uint256)) public roundWeights;

    // Array to store addresses that submitted weights in a round
    mapping(uint8 => address[]) public roundClients;
    
    // Mapping to track if a client has submitted for a round
    mapping(uint8 => mapping(address => bool)) public hasSubmitted;

    // Address allowed to read all weights
    address public server;

    // Event to log weight submissions
    event WeightSubmitted(address indexed client, uint256 weight, uint8 round);

    // Constructor that requires the server address
    constructor(address _server) {
        server = _server;
    }

    // Modifier to check if the server address is valid
    modifier onlyServer() {
        require(msg.sender == server, "Not authorized to read data");
        _;
    }

    // Function to submit weight for a specific round
    function submitWeight(uint8 _round, uint256 _weight) public {
        require(_round > 0 && _round <= maxRounds, "Round out of range");
        
        if (!hasSubmitted[_round][msg.sender]) {
            roundClients[_round].push(msg.sender);
            hasSubmitted[_round][msg.sender] = true;
        }

        roundWeights[_round][msg.sender] = _weight;
        emit WeightSubmitted(msg.sender, _weight, _round);
    }

    // Function to read all weights and client addresses for a specific round
    function readRoundWeights(uint8 _round) public view onlyServer returns (address[] memory, uint256[] memory) {
        require(_round > 0 && _round <= maxRounds, "Round out of range");

        address[] memory clients = roundClients[_round];
        uint256[] memory weights = new uint256[](clients.length);

        for (uint8 i = 0; i < clients.length; i++) {
            weights[i] = roundWeights[_round][clients[i]];
        }

        return (clients, weights);
    }
}
