const sdk = require('@defillama/sdk');
const { api2 } = require('@defillama/sdk3');
const ethers = require('ethers');
const utils = require('../utils');
const axios = require('axios');

const chainlinkEthUsd = '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612';
const rewardTracker = '0x4e971a87900b931fF39d1Aad67697F49835400b6';

const getVaultMarketValue = {
  inputs: [],
  name: 'getVaultMarketValue',
  outputs: [
    {
      internalType: 'int256',
      name: 'vaultMarketValue',
      type: 'int256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

//for chainlink
const latestAnswer = {
  inputs: [],
  name: 'latestAnswer',
  outputs: [{ internalType: 'int256', name: '', type: 'int256' }],
  stateMutability: 'view',
  type: 'function',
};

//reward tracker

const totalSupply = {
  inputs: [],
  name: 'totalSupply',
  outputs: [
    {
      internalType: 'uint256',
      name: '',
      type: 'uint256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const tokensPerInterval = {
  inputs: [],
  name: 'tokensPerInterval',
  outputs: [
    {
      internalType: 'uint256',
      name: '',
      type: 'uint256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

//glp price
const getPrice = {
  inputs: [{ internalType: 'bool', name: 'maximize', type: 'bool' }],
  name: 'getPrice',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const getUSDCBorrowed = {
  inputs: [],
  name: 'getUsdcBorrowed',
  outputs: [{ internalType: 'uint256', name: 'usdcAmount', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

// waterEthRewardsSplitRate
const getEthRewardsSplitRate = {
  inputs: [],
  name: 'getEthRewardsSplitRate',
  outputs: [{ internalType: 'uint256', name: 'feeSplitRate', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};
//

const addresses = {
  vodkaVault: '0x0081772FD29E4838372CbcCdD020f53954f5ECDE',
  waterVault: '0x6df0018b0449bB4468BfAE8507E13021a7aa0583',
};

const poolsFunction = async () => {
  const tvls = Object.fromEntries(
    await Promise.all(
      Object.entries(addresses).map(async ([name, address]) => {
        let res = (
          await sdk.api.abi.call({
            abi: getVaultMarketValue,
            target: address,
            chain: 'arbitrum',
          })
        ).output;
        return [name, Number(ethers.utils.formatUnits(res, 6))];
      })
    )
  );

  const usdcBorrowed = (
    await sdk.api.abi.call({
      abi: getUSDCBorrowed,
      target: addresses.vodkaVault,
      chain: 'arbitrum',
    })
  ).output;

  const ethPrice = (
    await sdk.api.abi.call({
      abi: latestAnswer,
      target: chainlinkEthUsd,
      chain: 'arbitrum',
    })
  ).output;

  const glpTokensPerInterval = (
    await sdk.api.abi.call({
      abi: tokensPerInterval,
      target: rewardTracker,
      chain: 'arbitrum',
    })
  ).output;

  const glpTotalSupply = (
    await sdk.api.abi.call({
      abi: totalSupply,
      target: rewardTracker,
      chain: 'arbitrum',
    })
  ).output;

  const VodkaGlpPrice = (
    await sdk.api.abi.call({
      abi: getPrice,
      target: addresses.vodkaVault,
      chain: 'arbitrum',
      params: [true],
    })
  ).output;

  const EthRewardsSplitRate = (
    await sdk.api.abi.call({
      abi: getEthRewardsSplitRate,
      target: addresses.waterVault,
      chain: 'arbitrum',
    })
  ).output;

  // calculate the annulized reward of glp's interval reward
  // = reward per interval * total interval * eth price
  const secondsPerYear = 31536000;
  const annualizedReward =
    Number(ethers.utils.formatUnits(ethPrice, 8)) *
    Number(ethers.utils.formatEther(glpTokensPerInterval)) *
    secondsPerYear;

  // calculate glp's apr
  // = annualized reward / (glp total supply * glp price)
  const glpApr =
    annualizedReward /
    (Number(ethers.utils.formatEther(glpTotalSupply)) *
      Number(ethers.utils.formatEther(VodkaGlpPrice)));

  const protocolFee = 0.18;

  const rewardToUser = glpApr * tvls.vodkaVault * (1 - protocolFee);

  const waterFeeShare = Number(
    ethers.utils.formatUnits(EthRewardsSplitRate, 30)
  );

  const waterRewards = rewardToUser * waterFeeShare;
  const vodkaRewards = rewardToUser * (1 - waterFeeShare);

  const vodkaApy = (vodkaRewards / tvls.vodkaVault) * 100;
  const waterApy = (waterRewards / tvls.waterVault) * 100;

  const vodkaVault = {
    pool: '0x0081772FD29E4838372CbcCdD020f53954f5ECDE',
    chain: utils.formatChain('arbitrum'),
    project: 'vaultka',
    symbol: 'VODKA',
    tvlUsd: tvls.vodkaVault,
    poolMeta: 'VAULTKA_VODKA',
    underlyingTokens: ['0x2F546AD4eDD93B956C8999Be404cdCAFde3E89AE'],
    apy: vodkaApy,
  };

  const waterVault = {
    pool: '0x6df0018b0449bB4468BfAE8507E13021a7aa0583',
    chain: utils.formatChain('arbitrum'),
    project: 'vaultka',
    symbol: 'WATER',
    tvlUsd: tvls.waterVault - usdcBorrowed / 10e5,
    poolMeta: 'VAULTKA_WATER',
    underlyingTokens: ['0xff970a61a04b1ca14834a43f5de4533ebddb5cc8'],
    apy: waterApy,
    totalSupplyUsd: tvls.waterVault,
    totalBorrowUsd: usdcBorrowed / 10e5,
  };
  //calculation of new pools
  const newAddresses = {
    whiskey: '0x6532eFCC1d617e094957247d188Ae6d54093718A',
    whiskeyWater: '0xa100E02e861132C4703ae96D6868664f27Eaa431',
    sake: '0x45BeC5Bb0EE87181A7Aa20402C66A6dC4A923758',
    sakeWater: '0x6b367F9EB22B2E6074E9548689cddaF9224FC0Ab',
  };

  const contractAbis = {
    gainsBalance: 'function getGainsBalance() view returns (uint256)',
    gTokenPrice: 'function gTokenPrice() view returns (uint256)',
    wWaterBalance: 'function balanceOfDAI() public view returns (uint256)',
    vlpBalance: 'function getVlpBalance() public view returns (uint256)',
    stakedVlpBalance:
      'function getStakedVlpBalance() public view returns (uint256)',
    vlpPrice: 'function getVLPPrice() public view returns (uint256)',
    waterUSDCBal: 'function balanceOfUSDC() public view returns (uint256)',
    waterTotalAssets: 'function totalAssets() public view returns (uint256)',
    feeSplit: 'function fixedFeeSplit() public view returns (uint256)',
  };
  //calculation of tvls
  const whiskeyGainsBalance = await api2.abi.call({
    abi: contractAbis.gainsBalance,
    target: newAddresses.whiskey,
    chain: 'arbitrum',
  });

  const whiskeyGTokenPrice = await api2.abi.call({
    abi: contractAbis.gTokenPrice,
    target: newAddresses.whiskey,
    chain: 'arbitrum',
  });

  const whiskeyWaterDaiBal = await api2.abi.call({
    abi: contractAbis.wWaterBalance,
    target: newAddresses.whiskeyWater,
    chain: 'arbitrum',
  });

  const sakeWaterUSDCBal = await api2.abi.call({
    abi: contractAbis.waterUSDCBal,
    target: newAddresses.sakeWater,
    chain: 'arbitrum',
  });

  const vlpBal = await api2.abi.call({
    abi: contractAbis.vlpBalance,
    target: newAddresses.sake,
    chain: 'arbitrum',
  });

  const StakedVLPBal = await api2.abi.call({
    abi: contractAbis.stakedVlpBalance,
    target: newAddresses.sake,
    chain: 'arbitrum',
  });

  const sakeVLPPrice = await api2.abi.call({
    abi: contractAbis.vlpPrice,
    target: newAddresses.sake,
    chain: 'arbitrum',
  });

  const WhiskeyWaterTotalAssets = await api2.abi.call({
    abi: contractAbis.waterTotalAssets,
    target: newAddresses.whiskeyWater,
    chain: 'arbitrum',
  });

  const SakeWaterTotalAssets = await api2.abi.call({
    abi: contractAbis.waterTotalAssets,
    target: newAddresses.sakeWater,
    chain: 'arbitrum',
  });

  const whiskeyFeeSplit = await api2.abi.call({
    abi: contractAbis.feeSplit,
    target: newAddresses.whiskey,
    chain: 'arbitrum',
  });

  const getSakeFeeSplit = await api2.abi.call({
    abi: contractAbis.feeSplit,
    target: newAddresses.sake,
    chain: 'arbitrum',
  });

  //calculation of Whiskey apys
  const response = (await axios.get(`https://backend-arbitrum.gains.trade/apr`))
    .data;

  const gDAIApy = response.vaultApr;

  const whiskeyOverWaterTvl =
    (whiskeyGainsBalance * whiskeyGTokenPrice) / WhiskeyWaterTotalAssets;

  const feeSplit = whiskeyFeeSplit / 100;

  const whiskeyApy = gDAIApy * 3 * (1 - feeSplit);
  const whiskeyWaterApy = (gDAIApy * feeSplit * whiskeyOverWaterTvl) / 10 ** 18;

  //calculation of Sake apys
  let vlpApr = 0;
  async function fetchVLPApy() {
    try {
      const response = await axios.get(
        'https://api.vela.exchange/graph/vlp-apr/42161'
      );
      const data = response.data;
      vlpApr = data.VLP_APR;
    } catch (error) {}
  }
  await fetchVLPApy();

  const sakeTvl = ((vlpBal + StakedVLPBal) * sakeVLPPrice) / 1e18 / 1e5;

  const sakeFeeSplit = getSakeFeeSplit / 100;

  const sakeApr = vlpApr <= 0 ? 0 : vlpApr * 3 * (1 - sakeFeeSplit);

  const sakeWaterApr =
    vlpApr <= 0 ? 0 : vlpApr * sakeFeeSplit * (sakeTvl / SakeWaterTotalAssets);

  //info of the pools

  const whiskeyVault = {
    pool: '0x6532eFCC1d617e094957247d188Ae6d54093718A',
    chain: utils.formatChain('arbitrum'),
    project: 'vaultka',
    symbol: 'WHISKEY',
    tvlUsd: (whiskeyGainsBalance * whiskeyGTokenPrice) / 1e36,
    poolMeta: 'VAULTKA_WHISKEY',
    apy: whiskeyApy,
  };

  const whiskeyWaterVault = {
    pool: '0xa100E02e861132C4703ae96D6868664f27Eaa431',
    chain: utils.formatChain('arbitrum'),
    project: 'vaultka',
    symbol: 'W-WATER',
    tvlUsd: whiskeyWaterDaiBal / 1e18,
    poolMeta: 'VAULTKA_W-WATER',
    apy: whiskeyWaterApy,
    totalSupplyUsd: WhiskeyWaterTotalAssets / 1e18,
    totalBorrowUsd: (WhiskeyWaterTotalAssets - whiskeyWaterDaiBal) / 1e18,
  };

  const sakeVault = {
    pool: '0x45BeC5Bb0EE87181A7Aa20402C66A6dC4A923758',
    chain: utils.formatChain('arbitrum'),
    project: 'vaultka',
    symbol: 'SAKE',
    tvlUsd: ((vlpBal + StakedVLPBal) * sakeVLPPrice) / 1e18 / 1e5,
    poolMeta: 'VAULTKA_SAKE',
    apy: sakeApr,
  };

  const sakeWaterVault = {
    pool: '0x6b367F9EB22B2E6074E9548689cddaF9224FC0Ab',
    chain: utils.formatChain('arbitrum'),
    project: 'vaultka',
    symbol: 'S-WATER',
    tvlUsd: sakeWaterUSDCBal / 1e6,
    poolMeta: 'VAULTKA_S-WATER',
    apy: sakeWaterApr,
    totalSupplyUsd: SakeWaterTotalAssets / 1e6,
    totalBorrowUsd: (SakeWaterTotalAssets - sakeWaterUSDCBal) / 1e6,
  };

  return [
    vodkaVault,
    waterVault,
    whiskeyVault,
    whiskeyWaterVault,
    sakeVault,
    sakeWaterVault,
  ];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://www.vaultka.com/app/vaults',
};
