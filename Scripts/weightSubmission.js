require('dotenv').config();
const { ethers } = require("hardhat");
const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const cliProgress = require('cli-progress');
const ora = require('ora');
const chalk = require('chalk');
const boxen = require('boxen');

// Configuration for paths and contract address
const accountsFilePath = process.env.ACCOUNTS_FILE_PATH || './accounts.csv';
const contractAddress = process.env.CONTRACT_ADDRESS || '0xYourContractAddress';
const logFilePath = process.env.LOG_FILE_PATH || './log.txt';
const csvFilePath = process.env.CSV_FILE_PATH || './submission_log.csv';

// Initialize CSV writers
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
    path: process.env.READ_CSV_PATH || './serverReads.csv',
    header: [
        { id: 'round', title: 'Round Number' },
        { id: 'address', title: 'Address' },
        { id: 'weight', title: 'Weight' },
        { id: 'latency', title: 'Latency (ms)' },
        { id: 'transactionHash', title: 'Transaction Hash' },
        { id: 'index', title: 'User Index' }
    ]
});

// Append log function
function appendToLogFile(text) {
    fs.appendFileSync(logFilePath, text + '\n');
    console.log(text);
}

// Delay function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Load private keys from CSV
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
            .on('error', reject);
    });
}

// Load weights from CSV
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
            .on('error', reject);
    });
}

// Function to submit with retries
async function submitWithRetry(txFunction, retries = 5, delayMs = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await txFunction();
        } catch (error) {
            console.error(`Error occurred: ${error.message}`);
            if (i < retries - 1) {
                console.log(`Retrying in ${delayMs}ms...`);
                await delay(delayMs);
                delayMs *= 2;
            } else {
                throw new Error("Max retries reached");
            }
        }
    }
}

// Main execution function
async function main() {
    try {
        appendToLogFile("Initializing provider and server wallet...");
        const provider = new ethers.providers.JsonRpcProvider(process.env.API_URL);
        const serverWallet = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY, provider);
        const contractABI = JSON.parse(fs.readFileSync(process.env.CONTRACT_ABI_PATH, 'utf8')).abi;
        const contract = new ethers.Contract(contractAddress, contractABI, provider);
        const contractWithServer = contract.connect(serverWallet);

        appendToLogFile("Loading accounts and weights...");
        const accounts = await readPrivateKeys(accountsFilePath);
        const weights = await readWeights(process.env.WEIGHTS_FILE_PATH || './weights.csv');
        appendToLogFile(`Loaded ${accounts.length} accounts and ${weights.length} weights.`);

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
                    appendToLogFile(`Invalid account data at index ${index}`);
                    return;
                }

                const signer = new ethers.Wallet(account.privateKey, provider);
                const weight = parseInt(weights[index][`Client ${index} NMSE`] * 1000); // Adjust as needed

                if (isNaN(weight)) {
                    appendToLogFile(`Weight data missing or invalid for round ${round}, index ${index}`);
                    return;
                }

                try {
                    const spinner = ora(`Registering weight for round ${round}, account: ${account.address}`).start();
                    await submitWithRetry(async () => {
                        const feeData = await provider.getFeeData();
                        const txStartTime = Date.now();
                        const tx = await contractWithServer.connect(signer).submitWeight(round, weight, {
                            gasLimit: 1500000,
                            maxPriorityFeePerGas: ethers.utils.parseUnits("25", "gwei"),
                            maxFeePerGas: ethers.utils.parseUnits("50", "gwei")
                        });
                        spinner.text = `Transaction sent. Hash: ${tx.hash}`;

                        const receipt = await tx.wait();
                        const txEndTime = Date.now();
                        const latency = txEndTime - txStartTime;

                        spinner.succeed(chalk.green(`Weight registered: ${account.address} | Gas Used: ${receipt.gasUsed.toString()} | Latency: ${latency}ms`));

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
                }
            });

            await Promise.all(weightPromises);
            appendToLogFile(`--- Round ${round} --- Submission Completed`);
            progressBar.update(round);

            try {
                const [clientAddresses, submittedWeights] = await contractWithServer.readRoundWeights(round);
                const readLatency = Date.now() - startTime;

                const readRecords = clientAddresses.map((address, index) => ({
                    round,
                    address,
                    weight: submittedWeights[index],
                    latency: readLatency,
                    transactionHash: "N/A",
                    index
                }));

                await readCsvWriter.writeRecords(readRecords);
                appendToLogFile(`--- Round ${round} --- Read Completed`);
            } catch (readError) {
                appendToLogFile(`Error reading weights for round ${round}: ${readError.message}`);
            }

            await delay(3000);
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
