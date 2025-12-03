import { ethers } from 'ethers';

export interface WalletData {
  address: string;
  privateKey: string;
  mnemonic?: string;
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
