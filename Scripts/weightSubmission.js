require('dotenv').config();
const { ethers } = require("hardhat");
const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const cliProgress = require('cli-progress');
const ora = require('ora');
const chalk = require('chalk');
const boxen = require('boxen');

// Paths to the CSV files and environment setup
const accountsFilePath = '/home/fjaved/demos/hardhat-polygon/test/test_FL/accounts/accountsPolygon_FL_clients.csv';
const weightsFilePath = '/home/fjaved/demos/hardhat-polygon/FL_dataset/filtered_federated_learning_results.csv';
const contractAddress = '0x7d125799866eA9fA71AD402c61Fa60Ef7e5E1355'; // Your deployed contract address
const logFilePath = '/home/fjaved/demos/hardhat-polygon/test/test_FL/weightSubmission/weightsSubmission_50x1_log_demo.txt';
const csvFilePath = '/home/fjaved/demos/hardhat-polygon/test/test_FL/weightSubmission/weightsSubmission_50x1_log_demo.csv';

// Initialize CSV writer
const csvWriter = createCsvWriter({
    path: csvFilePath,
    header: [
        { id: 'iteration', title: 'Iteration' },
        { id: 'round', title: 'Round Number' },
        { id: 'address', title: 'Address' },
        { id: 'submittedWeight', title: 'Submitted NMSE' },
        { id: 'gasUsed', title: 'Gas Used' },
        { id: 'latency', title: 'Latency (ms)' },
        { id: 'transactionHash', title: 'Transaction Hash' },
        { id: 'transactionStatus', title: 'Transaction Status' }
    ]
});

const readCsvWriter = createCsvWriter({
    path: '/home/fjaved/demos/hardhat-polygon/test/test_FL/weightSubmission/serverReads.csv',
    header: [
        { id: 'round', title: 'Round Number' },
        { id: 'address', title: 'Address' },
        { id: 'weight', title: 'Weight' },
        { id: 'latency', title: 'Latency (ms)' },
        { id: 'transactionHash', title: 'Transaction Hash' },
        { id: 'index', title: 'User Index' }
    ]
});

// Function to append to log file
function appendToLogFile(text) {
    fs.appendFileSync(logFilePath, text + '\n');
    console.log(text);
}

// Function to delay execution
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function readPrivateKeys(filePath) {
    const accounts = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                accounts.push({ privateKey: row['Private Key'], address: row['Address'] });
            })
            .on('end', () => {
                console.log('Finished reading CSV.');
                resolve(accounts);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

// Read and parse the weights CSV file
async function readWeights(filePath) {
    const weights = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                weights.push(row);
            })
            .on('end', () => {
                console.log('Finished reading weights CSV.');
                resolve(weights);
            })
            .on('error', (error) => {
                console.error('Error reading weights CSV:', error);
                reject(error);
            });
    });
}

// Function to submit with retry logic
async function submitWithRetry(txFunction, retries = 5, delayMs = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await txFunction();
        } catch (error) {
            console.error(`Error occurred: ${error.message}`);
            if (i < retries - 1) {
                console.log(`Retrying in ${delayMs}ms...`);
                await delay(delayMs);
                delayMs *= 2; // Exponential backoff
            } else {
                throw new Error("Max retries reached");
            }
        }
    }
}

// Main function to orchestrate the script
async function main() {
    try {
        appendToLogFile("Initializing Ethereum provider and server wallet...");
        const provider = new ethers.providers.JsonRpcProvider(process.env.API_URL);
        const serverPrivateKey = '0xc7351a1ce020537e8b84f8e1f63da4ddb3e822537b1c34c53757c681cffd184d'; 
        const serverWallet = new ethers.Wallet(serverPrivateKey, provider);
        const contractABI = JSON.parse(fs.readFileSync('/home/fjaved/demos/hardhat-polygon/artifacts/contracts/WeightSubmission.sol/WeightSubmission.json', 'utf8')).abi;
        const contract = new ethers.Contract(contractAddress, contractABI, provider);
        const contractWithServer = contract.connect(serverWallet);

        appendToLogFile("Loading accounts and weights...");
        const accounts = await readPrivateKeys(accountsFilePath);
        const weights = await readWeights(weightsFilePath);
        appendToLogFile(`Accounts and weights loaded. Total accounts: ${accounts.length}, Total weight sets: ${weights.length}`);

        const progressBar = new cliProgress.SingleBar({
            format: chalk.cyan('Progress') + ' [{bar}] ' + chalk.yellow('{percentage}%') + ' | ETA: {eta}s | {value}/{total} Rounds Completed',
            barCompleteChar: chalk.green('█'),
            barIncompleteChar: chalk.gray('░'),
            hideCursor: true
        });
        progressBar.start(50, 0);

        for (let round = 1; round <= 50; round++) {
            appendToLogFile(`--- Round ${round} --- Starting`);
            const startTime = Date.now();

            const weightPromises = accounts.map(async (account, index) => {
                if (!account.privateKey || !ethers.utils.isAddress(account.address)) {
                    appendToLogFile(`Invalid account data at index ${index}: ${JSON.stringify(account)}`);
                    return; // Skip this iteration if account data is invalid
                }

                const signer = new ethers.Wallet(account.privateKey, provider);
                const weight = parseInt(weights[index][`Client ${index} NMSE`] * 1000); // Assuming 'weights' indexed by client number and round

                if (isNaN(weight)) {
                    appendToLogFile(`Weight data missing or invalid for round ${round}, index ${index}`);
                    return; // Skip if weight data is missing or invalid
                }

                try {
                    const spinner = ora(`Registering weight for round ${round}, account: ${account.address}`).start();
                    await submitWithRetry(async () => {
                        const feeData = await provider.getFeeData();
                        console.log(`Attempting transaction with Gas Price: ${ethers.utils.formatUnits(feeData.gasPrice, "gwei")} Gwei`);

                        const txStartTime = Date.now();
                        const tx = await contractWithServer.connect(signer).submitWeight(round, weight, {
                            gasLimit: 1500000, // Adjust the gas limit as needed
                            maxPriorityFeePerGas: ethers.utils.parseUnits("25", "gwei"), // Increased to avoid underpricing
                            maxFeePerGas: ethers.utils.parseUnits("50", "gwei") // Increased to avoid underpricing
                        });
                        spinner.text = `Transaction sent. Hash: ${tx.hash}`;

                        // Wait for the transaction to be mined
                        const receipt = await tx.wait();
                        const txEndTime = Date.now();
                        const latency = txEndTime - txStartTime;

                        spinner.succeed(chalk.green(`Weight registered: ${account.address} | Gas Used: ${receipt.gasUsed.toString()} | Latency: ${latency}ms | Transaction Hash: ${receipt.transactionHash}`));

                        const outputText = `Round ${round}, Address: ${account.address}, Weight: ${weight}, Gas Used: ${receipt.gasUsed.toString()}, Latency: ${latency}ms, TX Hash: ${receipt.transactionHash}`;
                        console.log(chalk.green(boxen(outputText, { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' })));
                        appendToLogFile(outputText);

                        await csvWriter.writeRecords([{
                            iteration: 1,
                            round,
                            address: account.address,
                            submittedWeight: weight,
                            gasUsed: receipt.gasUsed.toString(),
                            latency,
                            transactionHash: receipt.transactionHash,
                            transactionStatus: receipt.status ? 'Success' : 'Failed'
                        }]);
                    });
                } catch (error) {
                    console.error(`Error submitting weight for round ${round}, index ${index}:`, error);
                    appendToLogFile(`Error submitting weight for round ${round}, index ${index}: ${error.message}`);
                }
            });

            await Promise.all(weightPromises);
            appendToLogFile(`--- Round ${round} --- Submission Completed`);
            progressBar.update(round);

            // Server reads weights after all submissions are completed for the round
            try {
                const readStart = Date.now();
                const [clientAddresses, submittedWeights] = await contractWithServer.readRoundWeights(round);
                const readEnd = Date.now();
                const readLatency = readEnd - readStart;

                const readRecords = clientAddresses.map((address, index) => ({
                    round,
                    address,
                    weight: submittedWeights[index],
                    latency: readLatency,
                    transactionHash: "N/A",
                    index
                }));

                await readCsvWriter.writeRecords(readRecords);
                clientAddresses.forEach((address, index) => {
                    appendToLogFile(`Server Reading: Address: ${address}, Submitted Weight: ${submittedWeights[index]}`);
                });

                appendToLogFile(`--- Round ${round} --- Read Completed`);
            } catch (readError) {
                appendToLogFile(`Error reading weights for round ${round}: ${readError.message}`);
            }

            await delay(3000); // Delay between rounds
        }

        progressBar.stop();
    } catch (error) {
        appendToLogFile(`Critical Error: ${error.message}`);
        console.error('Critical failure:', error);
        process.exit(1);
    }
    appendToLogFile('All rounds completed successfully.');
}

main();