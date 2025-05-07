'use client';

import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseUnits } from 'viem';

// Token ABI for approval function
const tokenApprovalAbi = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

/**
 * Custom hook for handling token approvals
 * @param tokenAddress The address of the token contract
 * @param spenderAddress The address that will spend the tokens
 * @param decimals The number of decimals for the token
 */
export function useApprove(tokenAddress: string, spenderAddress: string, decimals: number = 18) {
  const [isApproving, setIsApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalSuccess, setApprovalSuccess] = useState(false);
  const [approvalHash, setApprovalHash] = useState<string | null>(null);
  
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  
  // Reset states
  const resetStates = () => {
    setApprovalError(null);
    setApprovalSuccess(false);
    setApprovalHash(null);
  };

  /**
   * Approve tokens for a spender
   * @param amount The amount to approve (as a string)
   * @param onSuccess Callback function to execute on successful approval
   * @param onError Callback function to execute on error
   */
  const approve = async (
    amount: string,
    onSuccess?: () => void,
    onError?: (error: Error) => void
  ) => {
    try {
      resetStates();
      setIsApproving(true);
      
      // Convert amount to token units
      const amountInUnits = parseUnits(amount, decimals);
      
      // Send approval transaction
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: tokenApprovalAbi,
        functionName: 'approve',
        args: [spenderAddress, amountInUnits]
      });
      
      setApprovalHash(hash);
      
      // Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({
        hash
      });
      
      // Check if transaction was successful
      if (receipt.status === 'success') {
        setApprovalSuccess(true);
        if (onSuccess) onSuccess();
      } else {
        throw new Error('Approval transaction failed');
      }
    } catch (error) {
      console.error('Approval error:', error);
      setApprovalError(error instanceof Error ? error.message : 'Failed to approve tokens');
      if (onError) onError(error instanceof Error ? error : new Error('Failed to approve tokens'));
    } finally {
      setIsApproving(false);
    }
  };
  
  return {
    approve,
    isApproving,
    approvalError,
    approvalSuccess,
    approvalHash,
    resetApproval: resetStates
  };
}
