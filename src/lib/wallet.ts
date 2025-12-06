import { ethers } from 'ethers';

export interface WalletData {
  address: string;
  privateKey: string;
  mnemonic?: string;
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Generate a new Ethereum-compatible wallet
 * This creates a random wallet with address and private key
 */
export const generateWallet = (): WalletData => {
  const wallet = ethers.Wallet.createRandom();
  
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase,
  };
};

/**
 * Encrypt a private key with a password
 */
export const encryptPrivateKey = async (privateKey: string, password: string): Promise<string> => {
  const wallet = new ethers.Wallet(privateKey);
  const encryptedJson = await wallet.encrypt(password);
  return encryptedJson;
};

/**
 * Decrypt an encrypted wallet JSON
 */
export const decryptPrivateKey = async (encryptedJson: string, password: string): Promise<string> => {
  const wallet = await ethers.Wallet.fromEncryptedJson(encryptedJson, password);
  return wallet.privateKey;
};

/**
 * Get wallet balance from blockchain RPC
 */
export const getWalletBalance = async (rpcUrl: string, address: string): Promise<string> => {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error('Error getting balance:', error);
    return '0';
  }
};

/**
 * Get wallet info from blockchain
 */
export const getWalletInfo = async (rpcUrl: string, address: string) => {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const [balance, txCount] = await Promise.all([
      provider.getBalance(address),
      provider.getTransactionCount(address),
    ]);
    
    return {
      balance: ethers.formatEther(balance),
      transactionCount: txCount,
    };
  } catch (error) {
    console.error('Error getting wallet info:', error);
    return {
      balance: '0',
      transactionCount: 0,
    };
  }
};

/**
 * Validate if string is a valid Ethereum address
 */
export const isValidAddress = (address: string): boolean => {
  return ethers.isAddress(address);
};

/**
 * Send native token (GYD) transaction on blockchain
 */
export const sendTransaction = async (
  rpcUrl: string,
  privateKey: string,
  toAddress: string,
  amount: string,
  chainId?: string
): Promise<TransactionResult> => {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Convert amount to wei
    const value = ethers.parseEther(amount);
    
    // Prepare transaction
    const tx = {
      to: toAddress,
      value: value,
      chainId: chainId ? parseInt(chainId) : undefined,
    };
    
    // Send transaction
    const txResponse = await wallet.sendTransaction(tx);
    
    // Wait for transaction to be mined
    const receipt = await txResponse.wait();
    
    return {
      success: true,
      txHash: receipt?.hash,
    };
  } catch (error: any) {
    console.error('Error sending transaction:', error);
    return {
      success: false,
      error: error.message || 'Transaction failed',
    };
  }
};

/**
 * Send transaction to liquidity pool (40% of fee)
 */
export const sendToLiquidityPool = async (
  rpcUrl: string,
  privateKey: string,
  liquidityPoolAddress: string,
  feeAmount: string,
  chainId?: string
): Promise<TransactionResult> => {
  // 40% of fee goes to liquidity pool
  const liquidityAmount = (parseFloat(feeAmount) * 0.40).toString();
  return sendTransaction(rpcUrl, privateKey, liquidityPoolAddress, liquidityAmount, chainId);
};

/**
 * Estimate gas for a transaction
 */
export const estimateGas = async (
  rpcUrl: string,
  fromAddress: string,
  toAddress: string,
  amount: string
): Promise<string> => {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const value = ethers.parseEther(amount);
    
    const gasEstimate = await provider.estimateGas({
      from: fromAddress,
      to: toAddress,
      value: value,
    });
    
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || BigInt(0);
    const totalGasCost = gasEstimate * gasPrice;
    
    return ethers.formatEther(totalGasCost);
  } catch (error) {
    console.error('Error estimating gas:', error);
    return '0';
  }
};
