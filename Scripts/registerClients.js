// scripts/registerClients_v2.js

require('dotenv').config();
const { ethers } = require("hardhat");
const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const cliProgress = require('cli-progress');
const ora = require('ora');
const chalk = require('chalk');
const boxen = require('boxen');

// CSV and Log file setup using environment variables
const csvWriterInstance = createCsvWriter({
    path: process.env.REGISTRATION_CSV_PATH || './registration_log_demo.csv',
    header: [
        { id: 'iteration', title: 'Iteration' },
        { id: 'address', title: 'Address' },
        { id: 'gasUsed', title: 'Gas Used' },
        { id: 'cost', title: 'Cost (ETH)' },
        { id: 'latency', title: 'Latency (s)' },
        { id: 'userIndex', title: 'User Index' },
        { id: 'batchSize', title: 'Batch Size' }
    ]
});
const logFilePath = process.env.LOG_FILE_PATH || './registration_log_demo.txt';

function appendToLogFile(text) {
    fs.appendFileSync(logFilePath, text + '\n');
}

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
            .on('error', reject);
    });
}

async function main() {
    // Use Hardhat's provider
    const provider = ethers.provider;

    // Fetch current gas price
    const gasPrice = await provider.getGasPrice();
    console.log(`Current Gas Price: ${ethers.utils.formatUnits(gasPrice, "gwei")} Gwei`);

    // Fetch network details for debugging
    const network = await provider.getNetwork();
    console.log(`Connected to network: ${network.name} (${network.chainId})`);

    // Initialize deployer wallet
    const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    // Verify deployer's balance
    const deployerBalance = await provider.getBalance(deployer.address);
    console.log(`Server Balance: ${ethers.utils.formatEther(deployerBalance)} ETH`);
    
    if (deployerBalance.lt(ethers.utils.parseEther("0.1"))) { // Adjust as needed
        console.error("Deployer has insufficient funds. Please fund the deployer account.");
        process.exit(1);
    }

    // Read accounts from CSV
    const accountsData = await readPrivateKeys(process.env.ACCOUNTS_FILE_PATH || './accounts.csv');
    const accounts = accountsData.map(data => new ethers.Wallet(data.privateKey, provider));

    // Log each account's address and balance
    for (const account of accounts) {
        const balance = await provider.getBalance(account.address);
        console.log(`Account: ${account.address} | Balance: ${ethers.utils.formatEther(balance)} ETH`);
    }

    // Contract address and ABI path from environment variables
    const clientRegistrationAddress = process.env.CONTRACT_ADDRESS || '0xYourContractAddress';
    const clientRegistration = new ethers.Contract(
        clientRegistrationAddress,
        JSON.parse(fs.readFileSync(process.env.CONTRACT_ABI_PATH || './ClientRegistration.json', 'utf8')).abi,
        provider
    );

    console.log(`Client Registration Contract Address: ${clientRegistration.address}`);

    // Verify the existence of registerAsClient function
    if (!clientRegistration.registerAsClient) {
        console.error("Function registerAsClient does not exist in the contract ABI.");
        process.exit(1);
    }

    // Estimate gas for the transaction
    let estimatedGas;
    try {
        estimatedGas = await clientRegistration.estimateGas.registerAsClient();
        console.log(`Estimated Gas: ${estimatedGas.toString()}`);
    } catch (error) {
        console.error("Error estimating gas:", error);
        process.exit(1);
    }

    const costPerTx = estimatedGas.mul(ethers.utils.parseUnits("30", "gwei")); // Based on maxFeePerGas
    console.log(`Estimated cost per transaction: ${ethers.utils.formatEther(costPerTx)} ETH`);

    // Set up progress bar with colors
    const progressBar = new cliProgress.SingleBar({
        format: chalk.cyan('Progress') + ' [{bar}] ' + chalk.yellow('{percentage}%') + ' | ETA: {eta}s | {value}/{total} Clients Registered',
        barCompleteChar: chalk.green('█'),
        barIncompleteChar: chalk.gray('░'),
        hideCursor: true
    });

    progressBar.start(50, 0); // Registering 50 clients

    for (let iteration = 0; iteration < 1; iteration++) { // Single iteration
        console.log(`Starting iteration ${iteration + 1}`);
        for (let i = 0; i < 50; i++) { // Register 50 accounts
            const account = accounts[i];
            console.log(`Incoming client: Registration process for account ${i + 1}, iteration ${iteration + 1}`);
            const startTime = Date.now();

            try {
                // Connect the contract with the account's signer
                const clientRegistrationWithSigner = clientRegistration.connect(account);

                // Check if the account is already registered
                const isRegistered = await clientRegistration.registeredClients(account.address);
                if (isRegistered) {
                    console.log(`Account ${account.address} is already registered.`);
                    appendToLogFile(`Iteration ${iteration + 1}: Account ${account.address} is already registered.`);
                    progressBar.increment();
                    continue;
                }

                // Loading spinner for registration
                const spinner = ora(`Registering client on blockchain with address: ${account.address}`).start();

                // Send the transaction
                const txResponse = await clientRegistrationWithSigner.registerAsClient({
                    gasLimit: estimatedGas.mul(2), // Adding a buffer
                    maxPriorityFeePerGas: ethers.utils.parseUnits("25", "gwei"),
                    maxFeePerGas: ethers.utils.parseUnits("30", "gwei")
                });

                spinner.text = `Transaction sent. Hash: ${txResponse.hash}`;

                // Wait for the transaction to be mined
                const receipt = await txResponse.wait();
                const endTime = Date.now();
                const latency = (endTime - startTime) / 1000;

                // Calculate actual gas cost
                const actualGasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
                const costETH = ethers.utils.formatEther(actualGasCost);

                spinner.succeed(chalk.green(`Client registered: ${account.address} | Gas Used: ${receipt.gasUsed.toString()} | Latency: ${(latency * 1000).toFixed(0)} ms | Transaction Hash: ${receipt.transactionHash}`));

                const outputText = `Iteration ${iteration + 1}: Client ${account.address} registered: Transaction Hash - ${receipt.transactionHash}
Gas Used: ${receipt.gasUsed.toString()} | Cost: ${costETH} ETH | Latency: ${latency.toFixed(3)} s`;
                console.log(chalk.green(boxen(outputText, { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' })));
                appendToLogFile(outputText);

                const result = {
                    iteration: iteration + 1,
                    address: account.address,
                    gasUsed: receipt.gasUsed.toString(),
                    cost: costETH,
                    latency: latency.toFixed(3),
                    userIndex: i + 1,
                    batchSize: 1
                };
                await csvWriterInstance.writeRecords([result]);
                console.log(`Gas, latency, and transaction data for Round ${iteration + 1} saved to CSV.`);
            } catch (error) {
                console.error(`Error registering client ${account.address}:`, error);
                appendToLogFile(`Error registering client ${account.address}: ${error.message}`);
            }

            progressBar.increment();
            await delay(1000);  // Delay after each transaction
        }
    }

    progressBar.stop();
    console.log('Registration process completed and data saved.');
}

main().catch((error) => {
    console.error("Error running the script:", error);
    process.exitCode = 1;
});
