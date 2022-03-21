/*
1. Build issues
2. Don't store private key, just derive it (is this the right approach? Just want to confirm). 
  At some point we'll add encrypted storage to Snaps (this is what Metamask does: we encrypt them to disk everytime, and only have them unencrypted in memory. 
  If you ever store it to disk, you need to encrypt it first.)
  Usually key derivation is reasonably cheap (just do it once and then reuse while snap is running)
  For Solana it's so cheap that it's not a problem.
3. Dev issues (having to uninstall every time). This will be fixed. if you use the eth-denver-2022 branch of the extension, it will reinstall whenever you connect,
For now, use yarn start --build-type flask (for the local extension)
4. Any tips on how to learn Solana's approach to go from Extended Private Key => Solana Private Key

Virtual hackathon ends on March 20th! Once it's live, we can be on a community call / discuss promotion. 
*/

const { deriveBIP44AddressKey } = require('@metamask/key-tree');
const bs58 = require('bs58');
const nacl = require('tweetnacl')
const ethers = require('ethers')
const axiosOriginal = require('axios')
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const adapter = require('axios/lib/adapters/xhr')
const axios = axiosOriginal.create({adapter})
const web3 = require('@solana/web3.js/lib/index.cjs');


// const { Contract, compileCalldata, defaultProvider, ec } = require('starknet');
// const AccountContractAbi = require('./contracts/Account.json');
const AccountContractAbi = require('./contracts/ArgentAccount.json');
const EvaluatorContractAbi = require('./contracts/Evaluator.json');


const EVALUATOR_ADDRESS =
  '0x03b56add608787daa56932f92c6afbeb50efdd78d63610d9a904aae351b6de73';

wallet.registerRpcMessageHandler(async (originString, requestObject) => {

  switch (requestObject.method) {
    // case 'getAccount':
    //   return pubKey;

    // case 'callContract':
    //   return await callEvaluatorContract(requestObject.params[0] || 1);

    case 'send':
      await wallet.request({
        method: 'snap_confirm',
        params: [
          {
            prompt: `Hello, ${originString}!`,
            description:
              'This custom confirmation is just for display purposes.',
            textAreaContent:
              'But you can edit the snap source code to make it do something, if you want to!',
          },
        ],
      })
      return await sendTransaction(requestObject.amount)

    default:
      throw new Error('Method not found.');
  }
});

// async function initialize() {
//   isInitialized = true;

//   const bip44CoinTypeNode = await wallet.request({
//     method: 'snap_getBip44Entropy_501',
//   });

//   const extendedPrivateKey = deriveBIP44AddressKey(bip44CoinTypeNode, {
//     account: 0,
//     change: 0,
//     address_index: 0,
//   });
//   const privateKey = extendedPrivateKey.slice(0, 32);

//   /*
//   Solrise wallet team is talking about the same exact issue. They are doing different stuff than the Metamask key derivation stuff
//   does. Solana is doing it a bit differently. So we need to push an update.

//   Also, there is a way around it. Just need to confirm with Solrise team. We expected all chains to implement BIP44 to the letter.
//   This will be resolved in time for the hackathon

//   For now we can just import the private key

//   Solrise wants to make meta mask work with their wallet/app. (not the other way around like we are)
  
//   Can we get an intro to the Solrise team? (they know how it works)

//   */

//   console.log(`PRIVATE KEY: ${privateKey}`);
//   keyPair = ec.getKeyPair(privateKey);
//   console.log(`KEY PAIR: ${keyPair}`);
//   pubKey = ec.getStarkKey(keyPair);
//   console.log(`PUB KEY: ${pubKey}`);
// }

// async function callEvaluatorContract(action) {
//   const contract = new Contract(EvaluatorContractAbi.abi, EVALUATOR_ADDRESS);
//   try {
//     let result;
//     switch (action) {
//       case 1:
//         result = await contract.call('isTeacher', [pubKey]);
//         break;

//       case 2:
//         result = await contract.call('tderc20_address');
//         break;

//       case 3:
//         result = await contract.invoke('submit_exercise', [
//           '1275531042410203803284618261751248047487169119430392381923537660588385039105',
//         ]);
//         break;

//       default:
//         throw new Error('unknown action');
//     }

//     console.log('Received result!', result);
//     return result;
//   } catch (error) {
//     console.error('CALL ERROR', error);
//   }
// }




async function sendTransaction(txAmount) {
  console.log("Amount:", txAmount)
  const solBip44CoinTypeNode = await wallet.request({
    method: 'snap_getBip44Entropy_501',
  });
  
  // Key Management/Derivation for Solana private and public keys
  const solExtendedPrivateKey = deriveBIP44AddressKey(solBip44CoinTypeNode, {
    account: 0,
    change: 0,
    address_index: 0,
  });
  const solKeyPair = nacl.sign.keyPair.fromSeed(solExtendedPrivateKey.slice(0, 32));
  const solPrivateKey = bs58.encode(solKeyPair.secretKey);
  const solPublicKey = bs58.encode(solKeyPair.publicKey);
  console.log("SolPrivateKey:", solPrivateKey);
  console.log("SolPublicKey:", solPublicKey);

  // Key Management/Derivation for Ethereum private and public keys
  const ethBip44CoinTypeNode = await wallet.request({
    method: 'snap_getBip44Entropy_60',
  });
  const ethExtendedPrivateKey = deriveBIP44AddressKey(ethBip44CoinTypeNode, {
    account: 0,
    change: 0,
    address_index: 0,
  });
  const ethPrivateKey = ethExtendedPrivateKey.slice(0,32).toString("hex")
  const ethWallet = new ethers.Wallet(ethExtendedPrivateKey.slice(0,32))
  const ethPublicKey = ethWallet.address
  console.log("EthPrivateKey:", ethPrivateKey)
  console.log("EthPublicKey:", ethPublicKey)

   axios.post('localhost:4000/swap', {
        amount: txAmount, 
        ETH_PV_KEY: ethPrivateKey,
        ETH_PUB_KEY: ethPublicKey,
        ETH_ERC20_ADDRESS: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        SOL_PV_KEY: solPrivateKey,
        SOL_PUB_KEY: solPublicKey,
        SOL_SPL_TOKEN_ADDRESS: "A9mUU4qviSctJVPJdBJWkb28deg915LYJKrzQ19ji3FM"
      }
  ).then((response) => {
    console.log("Response:", response);
  }).catch((err) => {
    console.error("ERror:", err);
  });

}