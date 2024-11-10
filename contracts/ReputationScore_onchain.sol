// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract ReputationScore_onchain {
    uint public totalClients;  // Adjustable number of clients
    uint constant epsilon = 10;  // Using an integer for epsilon to avoid floating point errors; this is 1/epsilon in reality.

    mapping(uint => uint) public reputationScores;  // Maps client index to their reputation score
    uint[] public nmseValues;  // Array to store NMSE values of the current round

    constructor(uint _initialTotalClients) {
        totalClients = _initialTotalClients;  // Set initial number of clients
        initializeScores();  // Initialize scores upon contract deployment
    }

    // Function to set the total number of clients (Only by owner or specific role if needed)
    function setTotalClients(uint _totalClients) public {
        totalClients = _totalClients;
        initializeScores();  // Reinitialize scores when total clients change
    }

    // Function to initialize scores
    function initializeScores() public {
        for (uint i = 0; i < totalClients; i++) {
            reputationScores[i] = 0;  // Initialize each client's score to 0
        }
    }

    // Function to update scores for the current round based on provided NMSE values
    function updateScores(uint[] memory _nmseValues) public {
        require(_nmseValues.length == totalClients, "Input must match total clients.");
        nmseValues = _nmseValues;  // Update the stored NMSE values for the current round

        for (uint i = 0; i < totalClients; i++) {
            uint score = 1e18 / (nmseValues[i] + epsilon);  // Calculate reputation score for this round
            reputationScores[i] = score;  // Update reputation score
        }
    }

    // Function to select top 90% performers
    function selectTopPerformers() public view returns (uint[] memory) {
        uint[] memory indices = new uint[](totalClients);
        for (uint i = 0; i < totalClients; i++) {
            indices[i] = i;  // Initialize indices to sort by
        }

        // Simple insertion sort, optimize this for large numbers of clients
        for (uint i = 1; i < totalClients; i++) {
            uint key = reputationScores[indices[i]];
            uint j = i - 1;

            while ((int(j) >= 0) && (reputationScores[indices[j]] < key)) {
                indices[j + 1] = indices[j];
                j--;
            }
            indices[j + 1] = indices[i];
        }

        // Now return the top 90% indices
        uint cutoff = totalClients * 90 / 100;
        uint[] memory topPerformers = new uint[](cutoff);
        for (uint i = 0; i < cutoff; i++) {
            topPerformers[i] = indices[i];
        }

        return topPerformers;
    }
}
