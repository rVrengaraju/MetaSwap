import {
  attestFromEth,
  CHAIN_ID_ETH,
  CHAIN_ID_SOLANA,
  createWrappedOnSolana,
  getEmitterAddressEth,
  getSignedVAAWithRetry,
  parseSequenceFromLogEth,
  postVaaSolanaWithRetry,
  redeemOnSolana,
  transferFromEth,
} from "@certusone/wormhole-sdk";

import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  Connection,
  PublicKey,
  sendAndConfirmTransaction,
  Signer as SOLSigner,
} from "@solana/web3.js";
import { providers, Signer as ETHSigner, Wallet } from "ethers";
import base58 from "bs58";
import { NodeHttpTransport } from "@improbable-eng/grpc-web-node-http-transport";
import { setDefaultWasm } from "@certusone/wormhole-sdk/lib/cjs/solana/wasm";
setDefaultWasm("node"); // this fixes the unexpected token issue, the default wasm is intended for bundlers

type AttestParams = {
  connection: Connection; // Solana connection
  ethSigner: ETHSigner; // Ethereum wallet
  solSigner: SOLSigner;
  tokenAddress: string; // Ethereum token contract address
  solanaPayerAddress: string; // Solana payer address
};

type TransferParams = {
  connection: Connection;
  ethSigner: ETHSigner;
  solSigner: SOLSigner;
  tokenAddress: string;
  solanaPayerAddress: string;
  amount: number;
  recipientAddress: Uint8Array;
};

// ETH Constants
const ETH_BRIDGE_ADDRESS = "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B";
const ETH_TOKEN_BRIDGE_ADDRESS = "0x3ee18B2214AFF97000D974cf647E7C347E8fa585";
const MAINNET_ETH_ENDPOINT = "https://mainnet.infura.io/v3/2fdbd938f4b64e988733ddf0d3d84c82";

// SOL Constants
const SOL_BRIDGE_ADDRESS = "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth";
const SOL_TOKEN_BRIDGE_ADDRESS = "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb";
const MAINNET_SOL_ENDPOINT = "https://api.mainnet-beta.solana.com";

// Wormhole Constants
const WORMHOLE_RPC_HOST = "https://wormhole-v2-mainnet-api.certus.one"


const ethToSolanaAttestation = async ({
  connection,
  ethSigner,
  solSigner,
  tokenAddress,
  solanaPayerAddress,
}: AttestParams) => {
  console.log("Starting");

  // Submit transaction - results in a Wormhole message being published
  const receipt = await attestFromEth(
    ETH_TOKEN_BRIDGE_ADDRESS,
    ethSigner,
    tokenAddress
  );
  console.log("Receipt:", receipt);
  console.log("Attested from ETH");

  // Get the sequence number and emitter address required to fetch the signedVAA of our message
  const sequence = parseSequenceFromLogEth(receipt, ETH_BRIDGE_ADDRESS);
  const emitterAddress = getEmitterAddressEth(ETH_TOKEN_BRIDGE_ADDRESS);

  // Fetch the signedVAA from the Wormhole Network (this may require retries while you wait for confirmation)
  const { vaaBytes } = await getSignedVAAWithRetry(
    [WORMHOLE_RPC_HOST],
    CHAIN_ID_ETH,
    emitterAddress,
    sequence,
    {
      transport: NodeHttpTransport(), // This should only be needed when running in node.
    },
    1000, //retryTimeout
    1000 //Maximum retry attempts
  );
  console.log("Signed VAA With Retry");

  // On Solana, we have to post the signedVAA ourselves
  await postVaaSolanaWithRetry(
    connection,
    // Partially signing with a solana key pair
    async (transaction) => {
      transaction.partialSign(solSigner);
      return transaction;
    },
    SOL_BRIDGE_ADDRESS,
    solanaPayerAddress,
    Buffer.from(vaaBytes),
    5
  );
  console.log("Posted VAA Solana With Retry");

  // Finally, create the wrapped token
  const transaction = await createWrappedOnSolana(
    connection,
    SOL_BRIDGE_ADDRESS,
    SOL_TOKEN_BRIDGE_ADDRESS,
    solanaPayerAddress,
    Buffer.from(vaaBytes)
  );
  console.log("Created Wrapped Transaction");

  // Shitty documentation from Wormhole (Keeping for reference)
  //   const signed = await wallet.signTransaction(transaction);
  //   const txid = await connection.sendRawTransaction(signed.serialize());
  //   await connection.confirmTransaction(txid);

  const res = await sendAndConfirmTransaction(connection, transaction, [
    solSigner,
  ]);
  console.log("Sent and confirmed transaction");
  return res;
};

const ethToSolTransfer = async ({
  connection,
  ethSigner,
  solSigner,
  tokenAddress,
  solanaPayerAddress,
  amount,
  recipientAddress,
}: TransferParams) => {
  console.log("Starting transfer");

  // Submit transaction - results in a Wormhole message being published
  const receipt = await transferFromEth(
    ETH_TOKEN_BRIDGE_ADDRESS,
    ethSigner,
    tokenAddress,
    amount,
    CHAIN_ID_SOLANA,
    recipientAddress
  );
  console.log("Receipt:", receipt);
  console.log("Transfer eth receipt created.");

  // Get the sequence number and emitter address required to fetch the signedVAA of our message
  const sequence = parseSequenceFromLogEth(receipt, ETH_BRIDGE_ADDRESS);
  const emitterAddress = getEmitterAddressEth(ETH_TOKEN_BRIDGE_ADDRESS);
  // Fetch the signedVAA from the Wormhole Network (this may require retries while you wait for confirmation)
  const { vaaBytes } = await getSignedVAAWithRetry(
    [WORMHOLE_RPC_HOST],
    CHAIN_ID_ETH,
    emitterAddress,
    sequence,
    {
      transport: NodeHttpTransport(), // This should only be needed when running in node.
    },
    1000, //retryTimeout
    1000 //Maximum retry attempts
  );
  console.log("Signed VAA WIth Retry")

  // On Solana, we have to post the signedVAA ourselves
  await postVaaSolanaWithRetry(
    connection,
    async (transaction) => {
      transaction.partialSign(solSigner);
      return transaction;
    },
    SOL_BRIDGE_ADDRESS,
    solanaPayerAddress,
    Buffer.from(vaaBytes),
    5
  );
  console.log("Posted VAA WIth Retry")

  // Shitty documentation from Wormhole (Keeping for reference)
    // const signed = await (transaction);
    // const txid = await connection.sendRawTransaction(signed.serialize());
    // await connection.confirmTransaction(txid);
  // const res = sendAndConfirmTransaction(connection, transaction, [solSigner]);
  // console.log("Sent and confirmed tx!")
  // return res;

  // redeem tokens on solana
  const transaction = await redeemOnSolana(
    connection,
    SOL_BRIDGE_ADDRESS,
    SOL_TOKEN_BRIDGE_ADDRESS,
    solanaPayerAddress,
    Buffer.from(vaaBytes)
  );
  // sign, send, and confirm transaction
  transaction.partialSign(solSigner);
  const txid = await connection.sendRawTransaction(
    transaction.serialize()
  );
  await connection.confirmTransaction(txid);
  console.log("Confirmed transactions:", txid, receipt.transactionHash);

  return {
    solTx: txid,
    ethTx: receipt.transactionHash
  }
};

const findAssociatedTokenAddress = async(
  walletAddress: PublicKey,
  tokenMintAddress: PublicKey
): Promise<PublicKey> => {
  console.log("Finding associated token address");

  const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID: PublicKey = new PublicKey(
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  );
  return (await PublicKey.findProgramAddress(
      [
          walletAddress.toBuffer(),
          TOKEN_PROGRAM_ID.toBuffer(),
          tokenMintAddress.toBuffer(),
      ],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
  ))[0];
}

export const ethToSol = async ({
  amount, 
  ETH_PV_KEY,
  ETH_PUB_KEY,
  ETH_ERC20_ADDRESS,
  SOL_PV_KEY,
  SOL_PUB_KEY,
  SOL_SPL_TOKEN_ADDRESS
}) => {
  // Ethereum Setup
  const ethProvider = new providers.JsonRpcProvider(
   MAINNET_ETH_ENDPOINT
  );
  const ethSigner: ETHSigner = new Wallet(ETH_PV_KEY, ethProvider);

  // Solana Setup
  const solConnection = new Connection(MAINNET_SOL_ENDPOINT, "confirmed");
  const solSigner = {
    publicKey: new PublicKey(SOL_PUB_KEY),
    secretKey: Buffer.from(base58.decode(SOL_PV_KEY))
  };
  const SOL_USDC_PUB_KEY = await findAssociatedTokenAddress(new PublicKey(SOL_PUB_KEY), new PublicKey(SOL_SPL_TOKEN_ADDRESS)); // Derive using Solana key + spl token address

  // Commenting out attestation since it's only required once per ethereum/solana account. Purely for demo purposes only.
  // Uncomment when running for first time.

  // const attestRes = await ethToSolanaAttestation({
  //   connection: solConnection,
  //   ethSigner,
  //   solSigner,
  //   tokenAddress: ETH_USD_ADDRESS,
  //   solanaPayerAddress: SOL_PUB_KEY,
  // });
  // console.log("Attest response:", attestRes);

  // Need to make sure that ethereum address has approved unlimited token transfers through wormhole
  // Otherwise will get a ERC20 transfer allowance exceeded, even when balance is sufficient!
  // Easy way to do this is doing a transfer through wormhole portal once: https://portalbridge.com/
  // TODO(aman): Programatically create an approve transaction
  const amntUSDMultiplier = 1000000; // Assuming amount is in USD and we're sending USDC (Really dumb here, change to disregard multiplier)
  const transactRes = await ethToSolTransfer({
    connection: solConnection,
    ethSigner,
    solSigner,
    tokenAddress: ETH_ERC20_ADDRESS,
    solanaPayerAddress: SOL_PUB_KEY,
    amount: parseInt(amount) * amntUSDMultiplier,
    recipientAddress: base58.decode(SOL_USDC_PUB_KEY.toBase58())
  });

  return {
    ethereumTransactionID: transactRes.ethTx,
    solanaTransactionID: transactRes.solTx
  }
}
