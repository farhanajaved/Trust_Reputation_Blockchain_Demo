const { ethers } = require("hardhat");
const csvParser = require("csv-parser");
const fs = require("fs");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const cliProgress = require('cli-progress');
const ora = require('ora');
const chalk = require('chalk');
const boxen = require('boxen');
const io = require('socket.io')(3001); // Set up Socket.IO server on port 3001

// Setup CSV writer to save gas, latency, and transaction details for each round in real-time
const csvHeader = [
    { id: 'round', title: 'Round' },
    { id: 'gasUsed', title: 'Gas Used (Update Scores)' },
    { id: 'latency', title: 'Latency (seconds)' },
    { id: 'txHash', title: 'Transaction Hash (Update Scores)' },
    { id: 'gasPrice', title: 'Gas Price (Gwei)' },
    { id: 'blockSize', title: 'Block Size (bytes)' },
    { id: 'transactionCount', title: 'Transaction Count' }
];

// Adding 50 separate columns for each client's reputation score
for (let i = 1; i <= 50; i++) {
    csvHeader.push({ id: `client${i}ReputationScore`, title: `Client ${i} Reputation Score` });
}

const writer = createCsvWriter({
    path: '/home/fjaved/demos/hardhat-polygon/test/reputationscore/gas_latency_reputation_demo.csv',
    header: csvHeader
});

const results = [];
const reputationScores = []; // Array to track reputation scores for each round for all clients

async function main() {
    const ReputationContract = await ethers.getContractFactory("ReputationScore_onchain");
    const reputation = await ReputationContract.attach('0xE8efc2A7B7C9Cb60222F09726999C95898b1f37C'); // Your deployed contract address

    // Set up progress bar with colors
    const progressBar = new cliProgress.SingleBar({
        format: chalk.cyan('Progress') + ' [{bar}] ' + chalk.yellow('{percentage}%') + ' | ETA: {eta}s | {value}/{total} Rounds Completed',
        barCompleteChar: chalk.green('█'),
        barIncompleteChar: chalk.gray('░'),
        hideCursor: true
    });

    // Reading NMSE values from CSV
    fs.createReadStream('/home/fjaved/demos/hardhat-polygon/FL_dataset/filtered_federated_learning_results.csv')
        .pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            progressBar.start(results.length, 0);

            for (let round = 0; round < results.length && round < 50; round++) {
                // Prepare NMSE values for each client in the round
                const nmseValues = Object.keys(results[round])
                    .filter(key => key.includes('Client'))
                    .map(key => ethers.utils.parseUnits(results[round][key], 18));

                console.log(chalk.blueBright(`Round ${round + 1}:`));

                // Time the updateScores transaction
                const spinner = ora(`Updating scores for round ${round + 1}...`).start();
                const startTime = Date.now();
                try {
                    const updateTx = await reputation.updateScores(nmseValues);
                    spinner.text = `Transaction sent. Hash: ${updateTx.hash}`;
                    const updateReceipt = await updateTx.wait();
                    const endTime = Date.now();
                    const latency = (endTime - startTime) / 1000; // Convert to seconds

                    // Fetch block details using the block number from the transaction receipt
                    const block = await ethers.provider.getBlock(updateReceipt.blockNumber);

                    if (!block) {
                        console.log(`Block details not found for block number: ${updateReceipt.blockNumber}`);
                        continue;
                    }

                    // Calculate gas used, latency, gas price (in Gwei), block size, and transaction count
                    const gasUsed = updateReceipt.gasUsed.toString();
                    const txHash = updateReceipt.transactionHash;
                    const gasPrice = ethers.utils.formatUnits(updateReceipt.effectiveGasPrice, "gwei"); // Convert to Gwei
                    const blockSize = block.size ? block.size.toString() : "N/A"; // Block size in bytes
                    const transactionCount = block.transactions.length; // Number of transactions in the block

                    // Calculate reputation score for each client
                    const clientReputationScores = nmseValues.map((value, index) => {
                        const normalizedScore = value.div(ethers.BigNumber.from("1000000000000000000"));
                        const score = parseFloat(ethers.utils.formatUnits(normalizedScore, 18));
                        // Print reputation score for each client to console
                        console.log(chalk.yellow(`Client ${index + 1} Reputation Score: ${score}`));
                        return score;
                    });

                    spinner.succeed(chalk.green(`Scores updated: Gas Used: ${gasUsed} | Latency: ${latency.toFixed(3)}s | Transaction Hash: ${txHash}`));

                    const outputText = `Round ${round + 1} | Gas Used: ${gasUsed} | Latency: ${latency.toFixed(3)}s | Transaction Hash: ${txHash} | Gas Price: ${gasPrice} Gwei | Block Size: ${blockSize} bytes | Transaction Count: ${transactionCount}`;
                    console.log(chalk.green(boxen(outputText, { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' })));

                    // Create CSV data for the round
                    const csvData = {
                        round: round + 1,
                        gasUsed: gasUsed,
                        latency: latency.toFixed(3), // Convert to string with 3 decimal places
                        txHash: txHash,
                        gasPrice: gasPrice, // Gas price in Gwei
                        blockSize: blockSize, // Block size in bytes
                        transactionCount: transactionCount // Number of transactions in the block
                    };

                    // Add each client's reputation score as a separate column
                    clientReputationScores.forEach((score, index) => {
                        csvData[`client${index + 1}ReputationScore`] = score;
                    });

                    // Write the gas, latency, and transaction data to the CSV file immediately after each round
                    await writer.writeRecords([csvData]);
                    console.log(`Gas, latency, and transaction data for Round ${round + 1} saved to CSV.`);

                    // Track the reputation scores for each round for all clients
                    reputationScores.push({
                        round: round + 1,
                        scores: clientReputationScores
                    });

                    // Emit round data to connected clients
                    io.emit('roundData', {
                        round: round + 1,
                        gasUsed: parseInt(gasUsed),
                        latency: parseFloat(latency.toFixed(3)),
                        gasPrice: parseFloat(gasPrice),
                        reputationScores: clientReputationScores
                    });

                } catch (error) {
                    spinner.fail(chalk.red(`Error updating scores for round ${round + 1}: ${error.message}`));
                    console.error(chalk.red(`Error updating scores for round ${round + 1}:`, error));
                }

                progressBar.increment();
            }

            progressBar.stop();
            console.log(chalk.green("All rounds processed and CSV generated."));
        });
}

main().catch((error) => {
    console.error("Error running the script:", error);
    process.exitCode = 1;
});
