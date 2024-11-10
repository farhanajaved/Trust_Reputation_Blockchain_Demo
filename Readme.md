# Introduction: 
The proposed framework for our work is shown below:

![Trustworthy Reputation for Federated Learning Using Blockchain and Smart Contracts: Framework](https://github.com/farhanajaved/Trust_Reputation_Blockchain_Demo/blob/main/Trust_FL_Blockchain_Framework.png)



Building upon the [MonB5G project](https://www.monb5g.eu), this project introduces a blockchain-powered framework designed to establish trustworthy federated learning (FL) in multi-stakeholder environments. As described by Barrachina et al. (2023) [^1], the MonB5G FL setup includes essential stages such as client registration, local model training, NMSE evaluation, and model aggregation to improve the global model.

To streamline the FL process on the blockchain, three smart contracts are deployed on the live Polygon testnet:

- **registration of Client**: Manages the onboarding of authorized participants.
- **submisison of performace parametes**: Handles NMSE data submissions, preserving data integrity through blockchain.
- **calculation of reputation**: Computes reputation scores for each participant based on their contributions.


By leveraging Chainlink’s MockDataFetcher and a custom external adapter, we can integrate external data sources, retrieving client information from a mock API and passing it to *weightSubmission.sol*. Subsequently, *reputationCalculation.sol* selects the top 90% of participants for aggregation into the global model in the following training round, promoting high-quality contributions and enhancing transparency via immutable selection criteria coded in the smart contracts.
Our smart contracts are integrated into a decentralized application (DApp) that provides interfaces for client registration, weight submission, and reputation score visualization.


# Sequential Script Execution Workflow

This document provides a step-by-step explanation of how to run three scripts sequentially to register clients, submit weights, and update reputation scores in a decentralized learning environment on the Polygon test network.


![Sequence Diagram](https://github.com/farhanajaved/Trust_Reputation_Blockchain_Demo/blob/main/Sequence_diagram.png)



## Citation

[^1]: Barrachina-Muñoz, Sergio, et al. "Cloud native federated learning for streaming: An experimental demonstrator." 2023 IEEE 24th International Conference on High Performance Switching and Routing (HPSR). IEEE, 2023.


## Overview of the Demo


### 1. Registration Script (`registerClients.js`)
- **Purpose**: Registers multiple clients on the blockchain.
- **Process**: Creates accounts and stores them in the smart contract deployed on the Polygon test.
- **Outcome**: A list of registered clients that can participate in the learning process.

### 2. Weight Submission Script (`weightSubmission.js`)
- **Purpose**: Handles "weight submission" by registered clients.
- **Process**: Clients submit their computed weights (e.g., model weights in a federated learning setup).
- **Rounds**: The script runs multiple rounds of submissions. After the **first round**, the system processes the collected data before proceeding to the next step.

### 3. Reputation Update Script (`reputationScore.js`)
- **Purpose**: Calculates and updates reputation scores for clients based on their parameters submissions.
- **Process**: Updates reputation scores on-chain, allowing for transparency and integrity in identifying top-performing clients.
- **Outcome**: Top clients may receive greater weighting in future rounds, or poorly performing clients may be excluded.

## Sequential Workflow of Each Script

### Step 1: Run Registration Script
```bash
npx hardhat run path_to/registerClients.js --network polygon
```
**What Happens Here**:
- Registers all clients that will participate in the learning process.
- Connects to the Polygon network using Hardhat, creates accounts, and stores their details on the blockchain.
- Once registration completes, all clients are ready to participate in weight submission.

### Step 2: Run Weight Submission Script
```bash
npx hardhat run path_to/weightSubmission.js --network polygon
```
**What Happens Here**:
- Clients submit their training model weights in a decentralized manner.
- These submissions are recorded on-chain using a smart contract.
- After the **first round** of submissions completes, you can move to the reputation calculation.
- Introduce logic to create a signal (e.g., writing to a file) when the first round completes to proceed automatically to the next step.

### Step 3: Run Reputation Update Script
```bash
npx hardhat run path_to/reputationScore_onChain.js --network polygon
```
**What Happens Here**:
- Calculates **reputation scores** for each client based on their weight submissions.
- Updates the scores on-chain, making them accessible for future decision-making.
- **Outcome**: Reputation scores determine the effectiveness of each client's contribution, helping to favor well-performing clients in subsequent training rounds.

## Example Sequential Process Flow

- **Step 1: Registration**
  - Command: `npx hardhat run registerClients.js --network polygon`
  - **Outcome**: All clients are registered on the Polygon network.
  - **Significance**: The network knows which clients are allowed to participate, with all identities properly set.

- **Step 2: Weight Submission**
  - Command: `npx hardhat run weightSubmission.js --network polygon`
  - **Outcome**: All registered clients submit their training model weights.
  - **Round Completion**: Once the **first round** of weight submissions is complete, move to reputation calculations.
  - **Significance**: Weight submissions are essential for aggregating data in federated learning.

- **Step 3: Reputation Calculation**
  - Command: `npx hardhat run reputationScore.js --network polygon`
  - **Outcome**: Reputation scores are computed and stored on-chain for transparency.
  - **Significance**: Reputation determines the quality of each client's contributions, impacting future participation.




