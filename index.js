const fs = require('fs');
const web3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const {readFileSync, writeFileSync} = require("fs");
const connection = new web3.Connection(web3.clusterApiUrl('mainnet-beta'), 'confirmed',);

const CoinGecko = require('coingecko-api');
const CoinGeckoClient = new CoinGecko();

// list of stable assets like usdc
const stables_addresses = ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'];
function isStable(tokenInfo){

    // tokenlist identify a stable coin for us
    if( tokenInfo.tags.indexOf('stablecoin') !== -1 )
        return true;

    // if not, we try to find via our address list
    if( stables_addresses.indexOf(tokenInfo.address) !== -1 )
        return true;

    // if not, we try to find by it's name:
    if( tokenInfo.symbol && tokenInfo.symbol.toLowerCase().indexOf('usd') !== -1 )
        return true;
    if( tokenInfo.name && tokenInfo.name.toLowerCase().indexOf('usd') !== -1 )
        return true;

    return false;
}

async function loadTokenList(){
    // get the list from here:
    // const tokenlist = (await axios.get("https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json")).data.tokens
    // using cache file temporary:
    return JSON.parse(await readFileSync('./tokenlist.json', 'utf8'));
}

async function loadCoinGeckoPrices(){
    // get a fresh list of prices from time to time:
    // let res = await CoinGeckoClient.coins.markets({localization:0, per_page: 10000});
    // await writeFileSync('./coingecko-market-data.json', JSON.stringify(res.data));

    // sample cache for testing:
    const res = JSON.parse(await readFileSync('./coingecko-market-data.json', 'utf8'));
    let prices = {}; // indexed by id
    for( let i in res ){
        const id = res[i].id;
        prices[id] = {
            id: id,
            price: res[i].current_price,
            price_change_percentage_24h: res[i].price_change_percentage_24h,
            price_change_24h: res[i].price_change_24h,
        };
    }
    return prices;
}

async function getUsdPriceFromSolBalance( prices, amount, tokenInfo ){

    // find token price by id
    const id = tokenInfo.extensions.coingeckoId;
    const res = prices[ id ];

    if( ! id || ! res ) {
        // not listed oin coingecko
        return {
            amountInUsd: 0,
            price: 0,
            price_change_percentage_24h: 0,
            price_change_24h: 0,
        }
    }

    if( isStable(tokenInfo) ) {
        res.amountInUsd = amount;
    }else{
        res.amountInUsd = amount * res.price;
    }

    return res;

}


async function solFetchWalletBalances(wallet) {

    // the public key object from wallet address
    const pubKey = new web3.PublicKey(wallet);

    let prices = await loadCoinGeckoPrices();
    let tokenListData = await loadTokenList();

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
            if( amount !== 0 ){
                const tokenInfo = tokenListByAddress[address] || {};
                tokenInfo.address = address;
                tokenInfo.amountInSol = amount;
                // if we have token amount and sol price we compute the
                // amount in usdc of user assets
                tokenInfo.amountInUsd = await getUsdPriceFromSolBalance(prices, amount, tokenInfo);
                tokenData.push(tokenInfo);
            }

        }
    }

    // now get sol balance
    let solBalance = await connection.getBalance(pubKey);
    solBalance /= 1_000_000_000;
    if (solBalance > 0) {
        let solInfo = {
            "amountInSol": solBalance,
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
        };
        solInfo.amountInUsd = await getUsdPriceFromSolBalance( prices, solBalance, solInfo );
        // Use same token info from wSOL to SOL.
        // Note: So11111111111111111111111111111111111111112 is the Wrapped SOL
        tokenData.push(solInfo);
    }

    dump(tokenData);

}

function dump(res){
    console.log('USER BALANCE: ')
    for( let i in res ){
        const r = res[i];
        // console.log(r);
        const symbol = r.symbol;
        const amountInSol = r.amountInSol;
        const price = r.amountInUsd.price;
        const price_change_percentage_24h = r.amountInUsd.price_change_percentage_24h;
        const price_change_24h = r.amountInUsd.price_change_24h;
        const amountInUsd = r.amountInUsd.amountInUsd;
        const line = symbol+' '+amountInSol+' SOL ($'+amountInUsd+'), '+price_change_percentage_24h+'%';
        console.log(line);
    }
}

async function main() {
    const SAMPLE_WALLET = '3LaMdD7uHQwcBJnxnw5bAmYxvCb9wBKwiZvjKw6iEYRS';
    await solFetchWalletBalances(SAMPLE_WALLET);
}

main()
