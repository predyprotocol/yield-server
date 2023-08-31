const sdk = require('@defillama/sdk')
const { ControllerAbi, ERC20Abi } = require('./abi')

const getAsset = async (chain = 'arbitrum', strategy, pairId, block = 'latest') => {
  const data = (
    await sdk.api.abi.call({
      target: strategy,
      abi: ControllerAbi.find((m) => m.name === 'getAsset'),
      params: [pairId],
      chain: chain,
      block: block,
    })
  ).output

  return data;
}

const getTotalSupply = async (chain = 'arbitrum', strategyToken, block = 'latest') => {
  const data = (
    await sdk.api.abi.call({
      target: strategyToken,
      abi: ERC20Abi.find((m) => m.name === 'totalSupply'),
      params: [],
      chain: chain,
      block: block,
    })
  ).output

  return data;
}


module.exports = {
  getAsset,
  getTotalSupply
}
