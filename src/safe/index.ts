import SafeApiKit from '@safe-global/api-kit'
import Safe, { EthersAdapter, SafeAccountConfig, SafeFactory } from '@safe-global/protocol-kit'
import { SafeTransaction, SafeTransactionDataPartial } from '@safe-global/safe-core-sdk-types'
import { ethers } from 'ethers'
import notary from "./Notary.json"
import dotenv from 'dotenv';

dotenv.config();


const RPC_URL = 'https://goerli.base.org'
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)

// Initialize signers

// Create a wallet instance from the sender's private key
const owner1Signer = new ethers.Wallet(process.env.OWNER_1_PRIVATE_KEY!, provider)
const owner2Signer = new ethers.Wallet(process.env.OWNER_2_PRIVATE_KEY!, provider)

const ethAdapterOwner1 = new EthersAdapter({
    ethers,
    signerOrProvider: owner1Signer
})

const txServiceUrl = 'https://safe-transaction-base-testnet.safe.global'
const safeService = new SafeApiKit({ txServiceUrl, ethAdapter: ethAdapterOwner1 })
let safeFactory: SafeFactory
let safeSdkOwner1: Safe
let safeAddress: string

// If you have an existing Safe, you can use it instead of deploying a new one
const EXISTING_SAFE_ADDRESS = '0x9889be9a9f1350Bb4c37410603F11fCA045E8967'

async function deploySafe() {
    console.log('Deploying Safe...')
    safeFactory = await SafeFactory.create({ ethAdapter: ethAdapterOwner1 })

    const safeAccountConfig: SafeAccountConfig = {
        owners: [
            await owner1Signer.getAddress(),
            await owner2Signer.getAddress()
        ],
        threshold: 2,
        // ... (Optional params) 
        // https://github.com/safe-global/safe-core-sdk/tree/main/packages/protocol-kit#deploysafe
    }

    /* This Safe is connected to owner 1 because the factory was initialized 
    with an adapter that had owner 1 as the signer. */
    safeSdkOwner1 = await safeFactory.deploySafe({ safeAccountConfig })

    safeAddress = await safeSdkOwner1.getAddress()

    console.log('Your Safe has been deployed:')
    console.log(`Address wallet ${safeAddress}`)
}

async function initalizeSafe(existingAddress = EXISTING_SAFE_ADDRESS) {

    safeAddress = existingAddress
    const ethAdapterOwner1 = new EthersAdapter({
        ethers,
        signerOrProvider: owner1Signer
    })

    safeSdkOwner1 = await Safe.create({
        ethAdapter: ethAdapterOwner1,
        safeAddress
    })
}

async function depositToSafe(depositSigner = owner1Signer, amount = '0.01') {

    const safeAmount = ethers.utils.parseUnits(amount, 'ether').toHexString()

    const transactionParameters = {
        to: safeAddress,
        value: safeAmount
    }

    const tx = await depositSigner.sendTransaction(transactionParameters)

    console.log(`Deposit Transaction: https://goerli.basescan.org/tx/${tx.hash}`)
}

// Any address can be used for destination. In this example, we use vitalik.eth
async function proposeTransaction(url_metadata: string,
    destination: string) {

    //const contract = new ethers.Contract(process.env.CONTRACT_NOTARY!, notary)

    let iface = new ethers.utils.Interface(notary);

    const dataSafeMint = iface.encodeFunctionData("safeMint", [destination,
        url_metadata]);

/*
    const dataSafeMint = contract.interface.functions.encode.safeMint(
        destination,
        url_metadata
    ).encodeABI();
*/
    const safeTransactionData: SafeTransactionDataPartial = {
        to: process.env.CONTRACT_NOTARY!,
        data: dataSafeMint,
        value: '0'
    }
    // Create a Safe transaction with the provided parameters
    const safeTransaction: SafeTransaction = await safeSdkOwner1.createTransaction({ safeTransactionData })

    // Deterministic hash based on transaction parameters
    const safeTxHash = await safeSdkOwner1.getTransactionHash(safeTransaction)

    // Sign transaction to verify that the transaction is coming from owner 1
    const senderSignature = await safeSdkOwner1.signTransactionHash(safeTxHash)

    await safeService.proposeTransaction({
        safeAddress,
        safeTransactionData: safeTransaction.data,
        safeTxHash,
        senderAddress: await owner1Signer.getAddress(),
        senderSignature: senderSignature.data,
    })
}

async function confirmTransaction() {

    const pendingTransactions = (await safeService.getPendingTransactions(safeAddress)).results

    // Assumes that the first pending transaction is the transaction we want to confirm
    const transaction = pendingTransactions[0]
    const safeTxHash = transaction.safeTxHash

    const ethAdapterOwner2 = new EthersAdapter({
        ethers,
        signerOrProvider: owner2Signer
    })

    const safeSdkOwner2 = await Safe.create({
        ethAdapter: ethAdapterOwner2,
        safeAddress
    })

    const signature = await safeSdkOwner2.signTransactionHash(safeTxHash)
    const response = await safeService.confirmTransaction(safeTxHash, signature.data)

    console.log('Transaction confirmed:', response)
    return { safeTxHash, confirmationResponse: response }
}

async function executeTransaction(safeTxHash: string, safeSdk: Safe = safeSdkOwner1) {
    const safeTransaction = await safeService.getTransaction(safeTxHash)
    const executeTxResponse = await safeSdk.executeTransaction(safeTransaction)
    const receipt = await executeTxResponse.transactionResponse?.wait()

    console.log('Transaction executed:')
    console.log(`tx: ${receipt?.transactionHash}`)

    return receipt?.transactionHash;
}

export const main = async (metadata:string, wallet:string) => {

    safeFactory = await SafeFactory.create({ ethAdapter: ethAdapterOwner1 });

    if (EXISTING_SAFE_ADDRESS) {
        await initalizeSafe()
    } else {
        await deploySafe()
        await depositToSafe()
    }

    await proposeTransaction(metadata, wallet);
    const { safeTxHash } = await confirmTransaction()
    return await executeTransaction(safeTxHash)

    // Run the following to re-execute transactions:
    // const pendingTransactions = await getPendingTransactions()
    // const transaction = pendingTransactions[0]
    // const safeTxHash = transaction.safeTxHash
    // console.log({safeTxHash})
    // executeTransaction(safeTxHash, safeSdkOwner1)
}
