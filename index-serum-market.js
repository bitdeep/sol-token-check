const fs = require('fs');
const web3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const {readFileSync} = require("fs");
const connection = new web3.Connection(web3.clusterApiUrl('mainnet-beta'), 'confirmed',);
const {Market} = require('@project-serum/serum');


// const Market = serum.Market;

async function getSolUsdPriceFromSerumMarket(){
    const wsol_usdc = new web3.PublicKey('9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT');
    const pid = new web3.PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin');
    const market = await Market.load(connection, wsol_usdc, {}, pid,);
    const bids = await market.loadBids(connection);
    const bidData = bids.getL2(1);
    if (bidData.length == 0) {
        // should not be possible, but just for safety
        return 0;
    }
    return bidData[0][0];
}

// list of stable assets like usdc
const stables_addresses = ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'];
function isStable(tokenInfo){
    if( tokenInfo.symbol && tokenInfo.symbol.toLowerCase().indexOf('usd') !== -1 )
        return true;
    if( stables_addresses.indexOf(tokenInfo.address) !== -1 )
        return true;
    return false;
}
async function solFetchWalletBalances(wallet) {

    // first we get SOL price from Serum Exchange:
    const usdSolPrice = await getSolUsdPriceFromSerumMarket();

    // the public key object from wallet address
    const pubKey = new web3.PublicKey(wallet);

    // get the list from here:
    // const tokenlist = (await axios.get("https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json")).data.tokens
    // using cache file temporary:
    let tokenListData = JSON.parse(await readFileSync('./tokenlist.json', 'utf8'));
    const res = await connection.getParsedTokenAccountsByOwner(
        pubKey,
        {programId: splToken.TOKEN_PROGRAM_ID});

    // just loop, and map token list by address
    let tokenListByAddress = {};
    for (let i in tokenListData) {
        const tokenData = tokenListData[i];
        const tokenAddress = tokenData.address;
        tokenListByAddress[tokenAddress] = tokenData;
        // if( i == 0 ) console.log(tokenListByAddress[tokenAddress]);
    }

    // now loop on user list and append extra info:
    let tokenData = [];
    let nftData = [];

    for (let i in res.value) {
        const obj = res.value[i];
        const address = obj.account.data.parsed.info.mint;
        const amount = parseFloat(obj.account?.data?.parsed?.info?.tokenAmount?.uiAmountString);
        const decimals = obj.account?.data?.parsed?.info?.tokenAmount?.decimals;
        if (decimals === 0 && amount >= 1) {
            // this is a nft, according to solana
            nftData.push({address: address, amount: amount});
        } else {
            // only with balance
            console.log(obj.account.data.parsed);
            const tokenInfo = tokenListByAddress[address] || {};
            tokenInfo.address = address;
            tokenInfo.amountInSol = amount;
            if( amount > 0 && usdSolPrice > 0 ){
                // if we have token amount and sol price we compute the
                // amount in usdc of user assets
                if( isStable(tokenInfo) )
                    tokenInfo.amountInUsd = amount;
                else
                    tokenInfo.amountInUsd = amount/usdSolPrice;
            }
            tokenData.push(tokenInfo);
        }
    }

    // now get sol balance
    let solBalance = await connection.getBalance(pubKey);
    solBalance /= 1_000_000_000;
    if (solBalance > 0) {
        // Use same token info from wSOL to SOL.
        // Note: So11111111111111111111111111111111111111112 is the Wrapped SOL
        tokenData.push({
            "amountInSol": solBalance,
            "usdSolPrice": usdSolPrice, // we add sol usd price here
            "amountInUsd": solBalance*usdSolPrice,
            "chainId": 102,
            "address": "So11111111111111111111111111111111111111112",
            "symbol": "SOL",
            "name": "SOL",
            "decimals": 9,
            "logoURI": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
            "tags": [],
            "extensions": {
                "website": "https://www.solana.com/",
                "coingeckoId": "solana"
            }
        });
    }

    console.log(tokenData);

}

async function main() {
    const SAMPLE_WALLET = '3LaMdD7uHQwcBJnxnw5bAmYxvCb9wBKwiZvjKw6iEYRS';
    await solFetchWalletBalances(SAMPLE_WALLET);
}

main()
