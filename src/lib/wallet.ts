import { ethers } from 'ethers';
import { getProviderWithFallback } from './rpcFallback';

export interface WalletData {
  address: string;
  privateKey: string;
  mnemonic?: string;
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  gasCost?: string;
}

export interface SponsoredTransactionResult extends TransactionResult {
  userFeePaid?: string;
  bankGasCost?: string;
}

// --- Blockchain connectivity cache ---
const RPC_TIMEOUT_MS = 5000;
let _rpcReachable: boolean | null = null;
let _rpcCheckedAt = 0;
const RPC_CHECK_INTERVAL = 60_000; // re-check every 60s

/**
 * Create a provider with a connection timeout.
 * Returns null if the RPC is known-unreachable (cached for 60 s).
 */
export const getSafeProvider = async (
  rpcUrl: string
): Promise<ethers.JsonRpcProvider | null> => {
  // Fast-fail if we recently discovered the RPC is down
  if (_rpcReachable === false && Date.now() - _rpcCheckedAt < RPC_CHECK_INTERVAL) {
    return null;
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    // Quick connectivity probe with timeout
    await Promise.race([
      provider.getBlockNumber(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('RPC timeout')), RPC_TIMEOUT_MS)
      ),
    ]);
    _rpcReachable = true;
    _rpcCheckedAt = Date.now();
    return provider;
  } catch {
    _rpcReachable = false;
    _rpcCheckedAt = Date.now();
    return null;
  }
};

/**
 * Generate a new Ethereum-compatible wallet
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
  return wallet.encrypt(password);
};

/**
 * Decrypt an encrypted wallet JSON
 */
export const decryptPrivateKey = async (encryptedJson: string, password: string): Promise<string> => {
  const wallet = await ethers.Wallet.fromEncryptedJson(encryptedJson, password);
  return wallet.privateKey;
};

/**
 * Get wallet balance – returns cached "0" when RPC unreachable
 */
export const getWalletBalance = async (rpcUrl: string, address: string): Promise<string> => {
  try {
    const provider = await getSafeProvider(rpcUrl);
    if (!provider) return '0';
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch {
    return '0';
  }
};
/**
 * Get wallet info from blockchain
 */
export const getWalletInfo = async (rpcUrl: string, address: string) => {
  try {
    const provider = await getSafeProvider(rpcUrl);
    if (!provider) return { balance: '0', transactionCount: 0 };
    const [balance, txCount] = await Promise.all([
      provider.getBalance(address),
      provider.getTransactionCount(address),
    ]);
    return {
      balance: ethers.formatEther(balance),
      transactionCount: txCount,
    };
  } catch {
    return { balance: '0', transactionCount: 0 };
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
    const provider = await getSafeProvider(rpcUrl);
    if (!provider) return { success: false, error: 'Blockchain network unreachable' };
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
    const provider = await getSafeProvider(rpcUrl);
    if (!provider) return '0';
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

/**
 * Send a bank-sponsored transaction where the bank pays gas fees
 * User's transaction is signed and broadcast, but gas is paid by bank's fee wallet
 * This uses meta-transaction pattern: user signs the transfer, bank relays it
 * 
 * For simplicity, we implement this as:
 * 1. Bank wallet sends GYD to recipient on behalf of user
 * 2. User's wallet sends GYD to bank wallet (to cover the transfer amount + fee)
 * 
 * Actually, for a true custodial system where bank holds all keys:
 * 1. User requests transfer
 * 2. Bank executes transfer from user's wallet using user's key
 * 3. Bank pays gas from fee wallet
 * 4. User sees fee in GYD deducted from their balance
 */
export const sendSponsoredTransaction = async (
  rpcUrl: string,
  userPrivateKey: string,
  bankFeeWalletPrivateKey: string,
  toAddress: string,
  amount: string,
  feeInGyd: string,
  bankFeeWalletAddress: string,
  chainId?: string
): Promise<SponsoredTransactionResult> => {
  try {
    const provider = await getSafeProvider(rpcUrl);
    if (!provider) return { success: false, error: 'Blockchain network unreachable' };
    const userWallet = new ethers.Wallet(userPrivateKey, provider);
    const bankWallet = new ethers.Wallet(bankFeeWalletPrivateKey, provider);
    
    // Convert amounts to wei
    const transferAmount = ethers.parseEther(amount);
    const feeAmount = ethers.parseEther(feeInGyd);
    const totalFromUser = transferAmount + feeAmount;
    
    // Step 1: User sends (amount + fee) to bank wallet
    // This deducts from user's on-chain balance
    const userToBankTx = await userWallet.sendTransaction({
      to: bankFeeWalletAddress,
      value: totalFromUser,
      chainId: chainId ? parseInt(chainId) : undefined,
    });
    await userToBankTx.wait();
    
    // Step 2: Bank wallet sends amount to recipient (bank pays gas)
    const bankToRecipientTx = await bankWallet.sendTransaction({
      to: toAddress,
      value: transferAmount,
      chainId: chainId ? parseInt(chainId) : undefined,
    });
    const receipt = await bankToRecipientTx.wait();
    
    // Calculate actual gas cost paid by bank
    const gasUsed = receipt?.gasUsed || BigInt(0);
    const gasPrice = receipt?.gasPrice || BigInt(0);
    const bankGasCost = ethers.formatEther(gasUsed * gasPrice);
    
    return {
      success: true,
      txHash: receipt?.hash,
      userFeePaid: feeInGyd,
      bankGasCost: bankGasCost,
    };
  } catch (error: any) {
    console.error('Error sending sponsored transaction:', error);
    return {
      success: false,
      error: error.message || 'Sponsored transaction failed',
    };
  }
};

/**
 * Alternative: Direct custodial transfer where bank executes on user's behalf
 * Bank uses user's private key to send, but bank wallet pays for gas via pre-funding
 * This is cleaner for a true custodial setup
 */
export const sendCustodialTransaction = async (
  rpcUrl: string,
  userPrivateKey: string,
  toAddress: string,
  amount: string,
  chainId?: string
): Promise<TransactionResult> => {
  try {
    const provider = await getSafeProvider(rpcUrl);
    if (!provider) return { success: false, error: 'Blockchain network unreachable' };
    const userWallet = new ethers.Wallet(userPrivateKey, provider);
    
    // Convert amount to wei
    const value = ethers.parseEther(amount);
    
    // Send transaction from user's wallet
    const tx = await userWallet.sendTransaction({
      to: toAddress,
      value: value,
      chainId: chainId ? parseInt(chainId) : undefined,
    });
    
    const receipt = await tx.wait();
    const gasUsed = receipt?.gasUsed || BigInt(0);
    const gasPrice = receipt?.gasPrice || BigInt(0);
    
    return {
      success: true,
      txHash: receipt?.hash,
      gasCost: ethers.formatEther(gasUsed * gasPrice),
    };
  } catch (error: any) {
    console.error('Error sending custodial transaction:', error);
    return {
      success: false,
      error: error.message || 'Transaction failed',
    };
  }
};
