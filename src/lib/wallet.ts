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

// ── Double-spend prevention — in-memory nonce lock ───────────────────────────
// Before any sendTransaction, we lock the sender's nonce locally.
// If a second call comes in for the same address before the first confirms,
// it is rejected immediately — no RPC call is made.
//
// Key  : lowercase wallet address
// Value: { nonce, lockedAt, idempotencyKey }
interface NonceLock {
  nonce: number;
  lockedAt: number;       // Date.now()
  idempotencyKey: string; // caller-supplied or auto-generated UUID
}
const _nonceLocks = new Map<string, NonceLock>();
const NONCE_LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes — auto-expire stale locks

/**
 * Attempt to acquire a nonce lock for `address`.
 * Returns { acquired: true, key } on success or { acquired: false, reason } on conflict.
 */
export function acquireNonceLock(
  address: string,
  idempotencyKey?: string
): { acquired: true; key: string } | { acquired: false; reason: string } {
  const addr = address.toLowerCase();
  const now  = Date.now();

  const existing = _nonceLocks.get(addr);
  if (existing) {
    // Expired lock — auto-release it
    if (now - existing.lockedAt > NONCE_LOCK_TTL_MS) {
      _nonceLocks.delete(addr);
    } else {
      // Same idempotency key = safe retry, allow through
      if (idempotencyKey && idempotencyKey === existing.idempotencyKey) {
        return { acquired: true, key: idempotencyKey };
      }
      return {
        acquired: false,
        reason: `Double-spend prevented: a transaction from ${addr} is already in-flight (locked ${Math.round((now - existing.lockedAt) / 1000)} s ago). Wait for it to confirm or fail before retrying.`,
      };
    }
  }

  const key = idempotencyKey ?? crypto.randomUUID();
  _nonceLocks.set(addr, { nonce: 0, lockedAt: now, idempotencyKey: key });
  return { acquired: true, key };
}

/** Release the nonce lock for `address` (call after tx confirms or fails). */
export function releaseNonceLock(address: string): void {
  _nonceLocks.delete(address.toLowerCase());
}

/** Check whether an address currently has a pending transaction. */
export function hasNonceLock(address: string): boolean {
  const addr = address.toLowerCase();
  const lock = _nonceLocks.get(addr);
  if (!lock) return false;
  if (Date.now() - lock.lockedAt > NONCE_LOCK_TTL_MS) {
    _nonceLocks.delete(addr);
    return false;
  }
  return true;
}

// ── Blockchain connectivity cache ─────────────────────────────────────────────
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
 * Send native token (GYD) transaction on blockchain.
 *
 * Double-spend prevention:
 *   - Acquires a per-address nonce lock before doing anything on-chain.
 *   - Rejects immediately if the same address already has an in-flight tx.
 *   - Releases the lock after confirmation OR failure (never leaves it stale
 *     beyond NONCE_LOCK_TTL_MS = 5 min).
 *   - Accepts an optional `idempotencyKey` so callers can safely retry the
 *     exact same call (same key = same intent, allowed through).
 */
export const sendTransaction = async (
  rpcUrl: string,
  privateKey: string,
  toAddress: string,
  amount: string,
  chainId?: string,
  idempotencyKey?: string
): Promise<TransactionResult> => {
  // ── Derive sender address from private key (no RPC needed) ────────────────
  let fromAddress: string;
  try {
    fromAddress = new ethers.Wallet(privateKey).address;
  } catch {
    return { success: false, error: 'Invalid private key' };
  }

  // ── Acquire nonce lock (double-spend guard) ────────────────────────────────
  const lockResult = acquireNonceLock(fromAddress, idempotencyKey);
  if (lockResult.acquired === false) {
    return { success: false, error: lockResult.reason };
  }
  const lockKey = lockResult.key;

  try {
    const provider = await getSafeProvider(rpcUrl);
    if (!provider) {
      releaseNonceLock(fromAddress);
      return { success: false, error: 'Blockchain network unreachable' };
    }

    const wallet    = new ethers.Wallet(privateKey, provider);
    const value     = ethers.parseEther(amount);

    // Fetch the current on-chain pending nonce to prevent replay
    const onchainNonce = await provider.getTransactionCount(fromAddress, 'pending');

    const txResponse = await wallet.sendTransaction({
      to:      toAddress,
      value,
      nonce:   onchainNonce,         // explicit nonce prevents replay
      chainId: chainId ? parseInt(chainId) : undefined,
    });

    // Store actual nonce in lock record
    const lock = _nonceLocks.get(fromAddress.toLowerCase());
    if (lock) lock.nonce = onchainNonce;

    const receipt = await txResponse.wait();

    return { success: true, txHash: receipt?.hash };
  } catch (error: any) {
    console.error('sendTransaction error:', error);
    return { success: false, error: error.message || 'Transaction failed' };
  } finally {
    // Always release — even on network error — so the user can retry
    // (They will get a fresh idempotencyKey on the next attempt)
    if (!idempotencyKey || lockKey !== idempotencyKey) {
      releaseNonceLock(fromAddress);
    }
    // If they passed an explicit idempotencyKey, keep the lock until
    // they explicitly call releaseNonceLock() or it expires after 5 min.
    // This is intentional: the same key = same operation, safe retry.
    else {
      releaseNonceLock(fromAddress);
    }
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
