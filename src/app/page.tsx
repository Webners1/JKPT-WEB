"use client";

import { useState, useEffect, useRef } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits, decodeEventLog } from 'viem';
import { motion } from "framer-motion";
import { sepolia } from "viem/chains";
import { SoundManager, SOUNDS } from '../utils/sounds';

// Types for better type safety
type PrizeTier = {
  multiplier: number;
  probability: number;
  name: string;
  color: string;
};

type Reward = {
  multiplier: number;
  name: string;
  color: string;
  probability: number;
};

// Add type for decoded event log
type DecodedEventLog = {
  eventName: string;
  args: {
    won: boolean;
    reward: bigint;
    multiplier: bigint;
  };
};

// Replace with your actual token and game contract addresses
const TOKEN_ADDRESS = "0xe42b6bF1fE13A4b24EDdC1DB3cdA1EeF2156DcAB";
const GAME_ADDRESS = "0x5D1e8a10b028529A801bF631CfDB0260100537D4";

// Token contract ABI (minimal for balance and transfer functions)
const tokenABI = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

// Game contract ABI (for InstantScratchAndWin contract)
const gameABI = [
  {
    inputs: [],
    name: "minBet",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "maxBet",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "gamePaused",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getPrizeTiers",
    outputs: [
      { name: "multipliers", type: "uint256[]" },
      { name: "probabilities", type: "uint256[]" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "amount", type: "uint256" }],
    name: "placeBet",
    outputs: [
      { name: "won", type: "bool" },
      { name: "reward", type: "uint256" }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "player", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "won", type: "bool" },
      { indexed: false, name: "reward", type: "uint256" },
      { indexed: false, name: "multiplier", type: "uint256" }
    ],
    name: "BetPlaced",
    type: "event"
  }
] as const;

// Helper functions for visual effects
const adjustColor = (hex, amount) => {
  let color = hex;
  if (hex.startsWith('#')) {
    color = hex.slice(1);
  }

  const num = parseInt(color, 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return `#${(b | (g << 8) | (r << 16)).toString(16).padStart(6, '0')}`;
};

const drawCelebration = (ctx, width, height, color) => {
  // Draw celebration particles/confetti
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 5 + 2;

    // Mix various colors for more lively confetti
    const confettiColors = [
      color,
      adjustColor(color, 30),
      "#FFFFFF",
      "#FFD700",
      "#FF69B4",
      "#00BFFF"
    ];

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = confettiColors[Math.floor(Math.random() * confettiColors.length)];
    ctx.globalAlpha = Math.random() * 0.7 + 0.3;
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  // Draw some "stars"
  for (let i = 0; i < 25; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 3 + 1;
    const brightnessFactor = Math.random() * 50;

    // Create shimmering effect with slightly different colors
    ctx.fillStyle = `rgba(255, ${215 + brightnessFactor}, ${brightnessFactor}, 0.8)`;
    drawStar(ctx, x, y, 5, size * 2, size);
  }

  // Add some coin icons for a money-themed celebration
  const coinEmojis = ["💰", "🪙", "💎"];
  ctx.font = "16px Arial";
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * (width - 20) + 10;
    const y = Math.random() * (height - 20) + 10;
    const emoji = coinEmojis[Math.floor(Math.random() * coinEmojis.length)];
    ctx.fillText(emoji, x, y);
  }
};

const drawStar = (ctx, cx, cy, spikes, outerRadius, innerRadius) => {
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);

  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }

  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fill();
};

// Create the scratch patterns
const createScratchPatterns = () => {
  // Only run in browser environment
  if (typeof document === 'undefined') return null;

  try {
    const patternCanvas = document.createElement('canvas');
    const patternCtx = patternCanvas.getContext('2d');

    if (!patternCtx) return null;

    patternCanvas.width = 256;
    patternCanvas.height = 256;

    // Create a noise-like texture
    const imageData = patternCtx.createImageData(256, 256);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const noise = Math.random() * 255;
      data[i] = noise;     // red
      data[i + 1] = noise; // green
      data[i + 2] = noise; // blue
      data[i + 3] = Math.random() * 100 + 155; // alpha
    }

    patternCtx.putImageData(imageData, 0, 0);
    return patternCanvas;
  } catch (error) {
    console.error("Error creating scratch pattern:", error);
    return null;
  }
};

export default function InstantScratchAndWin() {
  const { address, isConnected } = useAccount();
  const [betAmount, setBetAmount] = useState("10");
  const [isScratching, setIsScratching] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [isDataLoading, setIsDataLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement>(null);
  const [canvasLoaded, setCanvasLoaded] = useState(false);
  const [scratchPattern, setScratchPattern] = useState<{x: number, y: number}[]>([]);
  const [lastPoint, setLastPoint] = useState<{x: number, y: number} | null>(null);
  const [percentScratched, setPercentScratched] = useState(0);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const scratchSoundRef = useRef<HTMLAudioElement | null>(null);
  const winSoundRef = useRef<HTMLAudioElement | null>(null);
  const startSoundRef = useRef<HTMLAudioElement | null>(null);
  const noWinSoundRef = useRef<HTMLAudioElement | null>(null);
  const scratchPatternRef = useRef<HTMLCanvasElement | null>(null);
  const publicClient = usePublicClient();
  const soundManager = SoundManager.getInstance();

  // Detect touch device and initialize sounds
  useEffect(() => {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined') {
      const isTouchDeviceCheck = 'ontouchstart' in window ||
        navigator.maxTouchPoints > 0;

      setIsTouchDevice(isTouchDeviceCheck);

      // Create sound effects
      if (typeof Audio !== 'undefined') {
        try {
          scratchSoundRef.current = new Audio('/sounds/scratch.mp3');
          scratchSoundRef.current.volume = 0.2;

          winSoundRef.current = new Audio('/sounds/win.mp3');
          winSoundRef.current.volume = 0.5;

          startSoundRef.current = new Audio('/sounds/card-flip.mp3');
          startSoundRef.current.volume = 0.3;

          noWinSoundRef.current = new Audio('/sounds/no-win.mp3');
          noWinSoundRef.current.volume = 0.3;

          // Create scratch pattern
          scratchPatternRef.current = createScratchPatterns();
        } catch (error) {
          console.error("Error initializing audio:", error);
        }
      }

      return () => {
        // Cleanup
        [scratchSoundRef, winSoundRef, startSoundRef, noWinSoundRef].forEach(soundRef => {
          if (soundRef.current) {
            try {
              soundRef.current.pause();
              soundRef.current = null;
            } catch (error) {
              console.error("Error cleaning up audio:", error);
            }
          }
        });
      };
    }
  }, []);

  // Get ETH balance with proper loading state
  const { data: ethBalance, isLoading: isLoadingEthBalance } = useBalance({
    address,
    query: {
      enabled: !!isConnected && !!address,
      refetchInterval: 5000 // Refresh every 5 seconds
    }
  });

  // Token contract interaction with proper loading states
  const { data: tokenBalance, isLoading: isLoadingTokenBalance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: tokenABI,
    functionName: "balanceOf",
    args: [address || "0x0000000000000000000000000000000000000000"],
    query: {
      enabled: !!isConnected && !!address,
      refetchInterval: 5000 // Refresh every 5 seconds
    }
  });

  const { data: tokenDecimals, isLoading: isLoadingTokenDecimals } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: tokenABI,
    functionName: "decimals",
    query: {
      enabled: !!isConnected,
      refetchInterval: 5000
    }
  });

  const { data: tokenSymbol, isLoading: isLoadingTokenSymbol } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: tokenABI,
    functionName: "symbol",
    query: {
      enabled: !!isConnected,
      refetchInterval: 5000
    }
  });

  const { data: tokenName, isLoading: isLoadingTokenName } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: tokenABI,
    functionName: "name",
    query: {
      enabled: !!isConnected,
      refetchInterval: 5000
    }
  });

  // Game contract interaction with proper loading states
  const { data: minBet, isLoading: isLoadingMinBet } = useReadContract({
    address: GAME_ADDRESS,
    abi: gameABI,
    functionName: "minBet",
    query: {
      enabled: !!isConnected,
      refetchInterval: 5000
    }
  });

  const { data: maxBet, isLoading: isLoadingMaxBet } = useReadContract({
    address: GAME_ADDRESS,
    abi: gameABI,
    functionName: "maxBet",
    query: {
      enabled: !!isConnected,
      refetchInterval: 5000
    }
  });

  // Get prize tiers with loading state
  const { data: prizeTiers, isLoading: isLoadingPrizeTiers } = useReadContract({
    address: GAME_ADDRESS,
    abi: gameABI,
    functionName: "getPrizeTiers",
    query: {
      enabled: !!isConnected,
      refetchInterval: 5000
    }
  });

  // Check if game is paused with loading state
  const { data: gamePaused, isLoading: isLoadingGamePaused } = useReadContract({
    address: GAME_ADDRESS,
    abi: gameABI,
    functionName: "gamePaused",
    query: {
      enabled: !!isConnected,
      refetchInterval: 5000
    }
  });

  // Update overall loading state
  useEffect(() => {
    const isLoading =
      isLoadingEthBalance ||
      isLoadingTokenBalance ||
      isLoadingTokenDecimals ||
      isLoadingTokenSymbol ||
      isLoadingTokenName ||
      isLoadingMinBet ||
      isLoadingMaxBet ||
      isLoadingPrizeTiers ||
      isLoadingGamePaused;

    setIsDataLoading(isLoading);
  }, [
    isLoadingEthBalance,
    isLoadingTokenBalance,
    isLoadingTokenDecimals,
    isLoadingTokenSymbol,
    isLoadingTokenName,
    isLoadingMinBet,
    isLoadingMaxBet,
    isLoadingPrizeTiers,
    isLoadingGamePaused
  ]);

  // Process prizeTiers data
  const [processedRewards, setProcessedRewards] = useState<Reward[]>([]);

  useEffect(() => {
    if (prizeTiers && Array.isArray(prizeTiers)) {
      const [multipliers, probabilities] = prizeTiers as [bigint[], bigint[]];

      // Create rewards array
      const rewards = multipliers.map((multiplier, index) => {
        // Convert from basis points (e.g. 50000 = 5x)
        const actualMultiplier = Number(multiplier) / 10000;
        // Convert probability from basis points to decimal (e.g. 200 = 2%)
        const probability = Number(probabilities[index]) / 10000;

        // Generate appropriate colors based on multiplier value
        let color = "#FFFFFF";
        if (actualMultiplier >= 5) color = "#FFD700"; // Gold for 5x
        else if (actualMultiplier >= 3) color = "#FFA500"; // Orange for 3x
        else if (actualMultiplier >= 2) color = "#FF6347"; // Red for 2x
        else if (actualMultiplier >= 1.5) color = "#4169E1"; // Blue for 1.5x
        else color = "#32CD32"; // Green for lower multipliers

        return {
          multiplier: actualMultiplier,
          probability,
          name: `${actualMultiplier}x Tokens`,
          color
        };
      });

      // Add the "No Win" option for the remaining probability
      const totalDefinedProbability = Number(probabilities.reduce(
        (sum, prob) => sum + prob, BigInt(0)
      )) / 10000;

      if (totalDefinedProbability < 1) {
        rewards.push({
          multiplier: 0,
          probability: 1 - totalDefinedProbability,
          name: "No Win",
          color: "#A9A9A9" // Gray for loss
        });
      }

      setProcessedRewards(rewards);
    }
  }, [prizeTiers]);

  // Format token balance
  const formattedTokenBalance = tokenBalance && tokenDecimals
    ? formatUnits(tokenBalance, Number(tokenDecimals))
    : "0";

  // Contract write functions
  const { writeContractAsync: approveTokens } = useWriteContract();
  const { writeContractAsync: placeBet } = useWriteContract();

  // Initialize scratch canvas
  useEffect(() => {
    if (isConnected && canvasRef.current && !canvasLoaded) {
      initializeScratchCard();
    }
  }, [isConnected, canvasLoaded]);

  const initializeScratchCard = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas dimensions
    canvas.width = 300;
    canvas.height = 200;

    // Create gradient background for a premium scratch card look
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#e0e0e0');
    gradient.addColorStop(0.5, '#f5f5f5');
    gradient.addColorStop(1, '#e0e0e0');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add scratch card pattern - more detailed and realistic
    ctx.fillStyle = '#BBB';

    // Add a subtle border
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

    // Apply scratch pattern
    if (scratchPatternRef.current) {
      const pattern = ctx.createPattern(scratchPatternRef.current, 'repeat');
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      // Fallback to simple pattern if custom pattern isn't available
      for (let i = 0; i < 7000; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = Math.random() * 1.5 + 0.5;
        const opacity = Math.random() * 0.3 + 0.1;

        ctx.fillStyle = `rgba(180, 180, 180, ${opacity})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Add scratch card "sparkles"
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;

      ctx.fillStyle = `rgba(255, 255, 255, 0.8)`;
      ctx.beginPath();
      ctx.arc(x, y, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Add subtle "Scratch Here" text
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(100, 100, 100, 0.15)';
    ctx.fillText('SCRATCH HERE', canvas.width / 2, canvas.height / 2);

    // Add logo watermark
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = 'rgba(100, 100, 100, 0.1)';
    ctx.fillText('💰 SCRATCH & WIN', canvas.width / 2, 30);

    setCanvasLoaded(true);
  };

  // Scratch card interactions
  const handleScratchStart = (e) => {
    if (!isScratching) return;
    e.preventDefault();

    // Only start scratching on left mouse button (button === 0)
    if (e.type === 'mousedown' && e.button !== 0) return;

    setLastPoint(null);
  };

  const handleScratch = (e) => {
    if (!isScratching || !canvasRef.current) return;

    // Only scratch if left mouse button is pressed
    if (e.type === 'mousemove' && e.buttons !== 1) return;

    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    // Get cursor position relative to canvas
    const currentX = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const currentY = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;

    if (currentX === undefined || currentY === undefined) return;

    // Enhanced scratch effect
    ctx.globalCompositeOperation = 'destination-out';
    const scratchSize = Math.random() * 5 + 15;

    // Connect scratch points for a smoother effect
    if (lastPoint) {
      const dx = currentX - lastPoint.x;
      const dy = currentY - lastPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 50) {
        // Draw the main scratch line
        ctx.lineWidth = scratchSize * 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();

        // Add texture to the scratch
        if (distance > 5) {
          const steps = Math.floor(distance / 3);
          for (let i = 0; i < steps; i++) {
            const ratio = i / steps;
            const x = lastPoint.x + dx * ratio + (Math.random() - 0.5) * 8;
            const y = lastPoint.y + dy * ratio + (Math.random() - 0.5) * 8;
            const particleSize = Math.random() * 6 + 3;

            ctx.beginPath();
            ctx.arc(x, y, particleSize, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      setScratchPattern(prev => [...prev, { x: currentX, y: currentY }]);
    } else {
      ctx.beginPath();
      ctx.arc(currentX, currentY, scratchSize, 0, Math.PI * 2);
      ctx.fill();
    }

    setLastPoint({ x: currentX, y: currentY });

    // Check scratch progress
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixelData = imageData.data;
    let transparentPixels = 0;

    for (let i = 3; i < pixelData.length; i += 4) {
      if (pixelData[i] < 128) transparentPixels++;
    }

    const totalPixels = canvas.width * canvas.height;
    const currentPercentScratched = (transparentPixels / totalPixels) * 100;
    setPercentScratched(currentPercentScratched);

    // Show result gradually as user scratches
    if (currentPercentScratched > 5) {
      if (scratchRef.current && reward) {
        drawReward(reward);
      }
    }

    // Reveal completely at 40% scratched
    if (currentPercentScratched > 40 && !isRevealed) {
      setIsRevealed(true);
      if (soundEnabled) {
        if (reward && reward.multiplier > 0) {
          soundManager.play('WIN');
        } else {
          soundManager.play('NO_WIN');
        }
      }
    }
  };

  const handleScratchEnd = () => {
    setLastPoint(null); // Reset when mouse/touch is released
  };

  // Show small peeks of the result while scratching
  const showPartialReveal = () => {
    if (!scratchRef.current || !canvasRef.current || isRevealed) return;

    // Create peek-through "windows" in the scratch card
    if (Math.random() > 0.7) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;

      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, Math.random() * 3 + 1, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // Place bet and start the game
  const handlePlay = async () => {
    if (!isConnected || loading || (gamePaused === true)) {
      if (gamePaused === true) {
        setError("Game is currently paused by the operator");
      }
      return;
    }

    try {
      setLoading(true);
      setError("");
      setReward(null);
      setIsScratching(false);
      setIsRevealed(false);
      setPercentScratched(0);

      // Reset and reinitialize the scratch card
      initializeScratchCard();

      // Start the bet process
      if (soundEnabled && startSoundRef.current) {
        startSoundRef.current.play().catch(() => {});
      }

      // Convert bet amount to token units
      const betAmountInUnits = parseUnits(
        betAmount,
        Number(tokenDecimals) || 18
      );

      // Check if bet amount is valid
      if (
        (minBet && betAmountInUnits < BigInt(minBet)) ||
        (maxBet && betAmountInUnits > BigInt(maxBet))
      ) {
        throw new Error(
          `Bet amount must be between ${formatUnits(BigInt(minBet), Number(tokenDecimals))} and ${formatUnits(BigInt(maxBet), Number(tokenDecimals))} ${String(tokenSymbol)}`
        );
      }

      // Check if user has enough tokens
      if (tokenBalance && betAmountInUnits > BigInt(tokenBalance)) {
        throw new Error(`Insufficient ${String(tokenSymbol)} balance`);
      }

      // First, approve tokens for the game contract
      const approvalHash = await approveTokens({
        address: TOKEN_ADDRESS,
        abi: tokenABI,
        functionName: "approve",
        args: [GAME_ADDRESS, betAmountInUnits],
        chain: sepolia as any,
        account: address
      });

      // Wait for approval transaction to confirm
      const approvalReceipt = await publicClient.waitForTransactionReceipt({
        hash: approvalHash
      });

      // Estimate gas for placeBet transaction
      const gasEstimate = await publicClient.estimateContractGas({
        address: GAME_ADDRESS,
        abi: gameABI,
        functionName: "placeBet",
        args: [betAmountInUnits],
        account: address
      });

      // Add 20% buffer to the gas estimate
      const gasWithBuffer = (gasEstimate * BigInt(150)) / BigInt(100);

      // Then place the bet with estimated gas
      const betHash = await placeBet({
        address: GAME_ADDRESS,
        abi: gameABI,
        functionName: "placeBet",
        args: [betAmountInUnits],
        chain: sepolia as any,
        account: address,
        gas: gasWithBuffer
      });

      // Save transaction hash for UI display
      setTxHash(betHash);

      // Wait for transaction to be confirmed
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: betHash
      });

      // Find the BetPlaced event in the logs
      const betPlacedLog = receipt.logs.find(log => {
        try {
          const decoded = decodeEventLog({
            abi: gameABI,
            data: log.data,
            topics: (log as any).topics
          }) as DecodedEventLog;
          return decoded.eventName === "BetPlaced";
        } catch {
          return false;
        }
      });

      if (betPlacedLog) {
        // Decode the log to get the bet result
        const decodedLog = decodeEventLog({
          abi: gameABI,
          data: betPlacedLog.data,
          topics: (betPlacedLog as any).topics
        }) as DecodedEventLog;

        // Extract the bet result
        const { won, reward, multiplier } = decodedLog.args;
        const multiplierValue = Number(multiplier) / 10000;

        // Find the matching reward tier from our processed rewards
        const rewardTier = processedRewards.find(r =>
          Math.abs(r.multiplier - multiplierValue) < 0.001
        ) || {
          multiplier: multiplierValue,
          name: multiplierValue > 0 ? `${multiplierValue}x Tokens` : "No Win",
          color: multiplierValue >= 5 ? "#FFD700" : multiplierValue >= 3 ? "#FFA500" :
                 multiplierValue >= 2 ? "#FF6347" : multiplierValue >= 1.5 ? "#4169E1" :
                 multiplierValue > 0 ? "#32CD32" : "#A9A9A9",
          probability: 0
        };

        // Set the reward to display in UI
        setReward(rewardTier);

        // Allow scratching
        setIsScratching(true);

        // Prepare the reward display on scratch card
        if (scratchRef.current) {
          drawReward(rewardTier);
        }
      } else {
        throw new Error("Failed to get game result from transaction logs");
      }
    } catch (err) {
      console.error("Error playing game:", err);
      setError(err instanceof Error ? err.message : "Failed to play. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Draw the reward under the scratch layer
  const drawReward = (rewardItem) => {
    if (!rewardItem || !scratchRef.current) return;

    const canvas = scratchRef.current;
    const ctx = canvas.getContext('2d');

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Create a radial gradient background
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 10,
      canvas.width / 2, canvas.height / 2, canvas.width / 2
    );

    // Use reward color with more vibrant gradient
    const baseColor = rewardItem.color;
    gradient.addColorStop(0, baseColor);
    gradient.addColorStop(0.6, adjustColor(baseColor, -30));
    gradient.addColorStop(1, adjustColor(baseColor, -60));

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add some sparkle effects
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = Math.random() * 2 + 1;

      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = Math.random() * 0.5 + 0.2;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Add text shadow for all text
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = "center";

    if (rewardItem.multiplier > 0) {
      // Draw "YOU WIN!" text
      ctx.font = "bold 36px Arial";
      ctx.fillText("YOU WIN!", canvas.width / 2, 60);

      // Draw reward amount
      ctx.font = "bold 40px Arial";
      const rewardAmount = (parseFloat(betAmount) * rewardItem.multiplier).toFixed(2);
      ctx.fillText(`${rewardAmount}`, canvas.width / 2, canvas.height / 2 - 10);

      // Draw token symbol
      ctx.font = "bold 24px Arial";
      ctx.fillText(String(tokenSymbol), canvas.width / 2, canvas.height / 2 + 20);

      // Draw multiplier
      ctx.font = "bold 28px Arial";
      ctx.fillText(`${rewardItem.multiplier}x Multiplier!`, canvas.width / 2, canvas.height - 40);

      // Add celebration effects
      drawCelebration(ctx, canvas.width, canvas.height, rewardItem.color);
    } else {
      // Draw "NO WIN" text
      ctx.font = "bold 48px Arial";
      ctx.fillText("NO WIN", canvas.width / 2, canvas.height / 2 - 20);

      // Draw "Try Again!" text
      ctx.font = "bold 28px Arial";
      ctx.fillText("Try Again!", canvas.width / 2, canvas.height / 2 + 30);
    }

    // Reset shadow
    ctx.shadowColor = 'transparent';
  };

  const toggleMute = () => {
    const isMuted = soundManager.toggleMute();
    // Update UI to reflect mute state
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-gradient-to-b from-purple-800 via-purple-900 to-indigo-900 text-white">
      {/* Header with wallet connection */}
      <header className="w-full p-4 flex justify-between items-center border-b border-purple-600/50 backdrop-blur-sm bg-purple-900/90 sticky top-0 z-10">
        <div className="text-2xl font-bold flex items-center">
          <span className="text-3xl mr-2">💰</span>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-yellow-500">
            Instant Scratch & Win
          </span>
        </div>
        <ConnectButton />
      </header>

      <main className="flex flex-col justify-center items-center flex-grow px-4 py-8 max-w-5xl mx-auto w-full">
        {isConnected ? (
          <>
            {/* Dashboard Layout */}
            <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left Column - Balance & Stats */}
              <div className="md:col-span-1">
                {/* Balance display with loading state */}
                <div className="bg-purple-800 rounded-xl p-6 w-full shadow-lg border border-purple-600 backdrop-blur-sm">
                  <h2 className="text-xl font-semibold mb-4 flex items-center text-yellow-300">
                    <span className="mr-2">💰</span> Your Balance
                  </h2>
                  <div className="space-y-4">
                    <div className="bg-purple-700/80 p-4 rounded-lg backdrop-blur-sm">
                      <div className="text-yellow-300 text-sm">ETH</div>
                      <div className="font-bold text-xl text-white">
                        {isLoadingEthBalance ? (
                          <div className="flex items-center">
                            <div className="w-4 h-4 border-2 border-t-white border-r-transparent border-b-white border-l-transparent rounded-full animate-spin mr-2"></div>
                            Loading...
                          </div>
                        ) : ethBalance?.formatted.slice(0, 7) || "0"}
                      </div>
                    </div>
                    <div className="bg-purple-700/80 p-4 rounded-lg backdrop-blur-sm">
                      <div className="text-yellow-300 text-sm">
                        {isLoadingTokenSymbol ? "Loading..." : String(tokenSymbol) || "Token"}
                      </div>
                      <div className="font-bold text-xl text-white">
                        {isLoadingTokenBalance ? (
                          <div className="flex items-center">
                            <div className="w-4 h-4 border-2 border-t-white border-r-transparent border-b-white border-l-transparent rounded-full animate-spin mr-2"></div>
                            Loading...
                          </div>
                        ) : parseFloat(formattedTokenBalance).toFixed(4) || "0"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-yellow-300">
                    {isLoadingTokenName ? "Loading..." : tokenName ? `Token: ${String(tokenName)}` : "Connect to see token details"}
                  </div>
                </div>

                {/* Coming Soon - Staking Module */}
                <div className="mt-6 bg-purple-800 rounded-xl p-6 w-full shadow-lg border border-purple-600 backdrop-blur-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-pink-600 text-xs font-bold px-3 py-1 rounded-bl-lg text-white">
                    COMING SOON
                  </div>
                  <h2 className="text-xl font-semibold mb-4 flex items-center text-yellow-300">
                    <span className="mr-2">⚡</span> Token Staking
                  </h2>
                  <p className="text-sm text-purple-200 mb-4">
                    Stake your tokens to earn passive rewards and exclusive benefits!
                  </p>
                  <div className="bg-purple-700/80 p-3 rounded-lg text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-purple-200">APY:</span>
                      <span className="font-bold text-yellow-300">Up to 25%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-200">Launch:</span>
                      <span className="text-white">Q2 2025</span>
                    </div>
                  </div>
                  <button className="w-full mt-4 py-2 bg-purple-600/80 rounded-lg text-white cursor-not-allowed border border-purple-500">
                    Staking Coming Soon
                  </button>
                </div>
              </div>

              {/* Middle and Right Columns - Game Section */}
              <div className="md:col-span-2">
                {/* Game section with loading state */}
                <div className="bg-purple-800 rounded-xl p-6 w-full shadow-lg border border-purple-600 backdrop-blur-sm">
                  <h2 className="text-xl font-semibold mb-6 flex items-center text-yellow-300">
                    <span className="mr-2">🎯</span> Scratch To Win!
                  </h2>

                  {/* Bet amount input with loading state */}
                  <div className="mb-6">
                    <label className="block text-sm mb-2 text-yellow-300">
                      Your Bet ({isLoadingTokenSymbol ? "Loading..." : String(tokenSymbol) || 'Tokens'})
                    </label>
                    <div className="flex items-center">
                      <input
                        type="number"
                        min={isLoadingMinBet ? "1" : minBet ? formatUnits(BigInt(minBet), Number(tokenDecimals) || 18) : "1"}
                        max={isLoadingMaxBet ? "100" : maxBet ? formatUnits(BigInt(maxBet), Number(tokenDecimals) || 18) : "100"}
                        value={betAmount}
                        onChange={(e) => setBetAmount(e.target.value)}
                        disabled={isScratching || loading || isDataLoading}
                        className="bg-purple-700/80 text-white rounded-l-lg p-3 w-full focus:outline-none focus:ring-2 focus:ring-purple-400 border border-purple-500 disabled:opacity-50"
                      />
                      <button
                        onClick={handlePlay}
                        disabled={isScratching || loading || isDataLoading}
                        className="bg-pink-600 hover:bg-pink-500 disabled:bg-gray-600 disabled:cursor-not-allowed font-bold py-3 px-6 rounded-r-lg transition transform hover:scale-105 active:scale-95 shadow-lg text-white disabled:opacity-50"
                      >
                        {loading ? (
                          <span className="flex items-center">
                            <span className="inline-block w-4 h-4 border-2 border-t-white border-r-transparent border-b-white border-l-transparent rounded-full animate-spin mr-2"></span>
                            Processing...
                          </span>
                        ) : isDataLoading ? (
                          <span className="flex items-center">
                            <span className="inline-block w-4 h-4 border-2 border-t-white border-r-transparent border-b-white border-l-transparent rounded-full animate-spin mr-2"></span>
                            Loading...
                          </span>
                        ) : "Play Now"}
                      </button>
                    </div>
                    <div className="text-xs mt-2 text-purple-200 flex justify-between">
                      <span>
                        {isLoadingMinBet || isLoadingMaxBet || isLoadingTokenDecimals
                          ? "Loading bet limits..."
                          : minBet && maxBet && tokenDecimals
                          ? `Min: ${formatUnits(BigInt(minBet), Number(tokenDecimals))} - Max: ${formatUnits(BigInt(maxBet), Number(tokenDecimals))}`
                          : "Loading bet limits..."}
                      </span>
                      <span className="text-yellow-300">Win up to 5x your bet!</span>
                    </div>
                  </div>

                  {/* Scratch card area with purple/gold design - mimicking the image */}
                  <div className="relative w-full flex justify-center mb-6">
                    <div className="relative w-[300px] h-[200px] rounded-xl overflow-hidden shadow-2xl transform transition-all duration-300 hover:scale-105">
                      {/* Background canvas with reward (visible after scratching) - Gold background with patterns like in the reference */}
                      <canvas
                        ref={scratchRef}
                        width={300}
                        height={200}
                        className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-yellow-400 to-yellow-300"
                      />

                      {/* Scratch overlay canvas - Black overlay that gets scratched away */}
                      <canvas
                        ref={canvasRef}
                        width={300}
                        height={200}
                        className={`absolute top-0 left-0 w-full h-full ${isScratching ? 'cursor-pointer' : 'cursor-default'} bg-black`}
                        onMouseDown={handleScratchStart}
                        onMouseMove={handleScratch}
                        onMouseUp={handleScratchEnd}
                        onMouseLeave={handleScratchEnd}
                        onTouchStart={handleScratchStart}
                        onTouchMove={handleScratch}
                        onTouchEnd={handleScratchEnd}
                      />

                      {/* Instructions overlay */}
                      {isScratching && !isRevealed && (
                        <div className="absolute bottom-10 left-0 right-0 flex justify-center">
                          <div className="bg-purple-900/70 rounded-full h-1 w-3/4 overflow-hidden">
                            <div
                              className="bg-yellow-400 h-full transition-all duration-300"
                              style={{ width: `${Math.min(percentScratched, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Instructions overlay */}
                      {!isScratching && !loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-purple-900 bg-opacity-90 text-white text-center p-4">
                          <div className="transform transition-all hover:scale-105">
                            <p className="text-lg font-bold text-yellow-300">
                              Place a bet to play!
                            </p>
                            <p className="text-sm mt-2 text-purple-200">
                              Scratch the card to reveal your prize
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Loading overlay with improved animation */}
                      {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-purple-900 bg-opacity-90 text-white">
                          <div className="text-center">
                            <div className="inline-block w-10 h-10 border-4 border-t-yellow-400 border-r-transparent border-b-yellow-500 border-l-transparent rounded-full animate-spin mb-3"></div>
                            <p className="text-purple-200">Processing transaction...</p>
                          </div>
                        </div>
                      )}

                      {/* Scratch instruction with animation */}
                      {isScratching && !isRevealed && (
                        <div className="absolute bottom-3 left-0 right-0 text-center">
                          <div className="inline-block text-purple-900 text-sm bg-yellow-400 py-2 px-4 rounded-full animate-bounce font-bold">
                            <span className="mr-1">{isTouchDevice ? '👆' : '🖱️'}</span>
                            {isTouchDevice ? 'Scratch the card!' : 'Click and drag to scratch!'}
                          </div>
                        </div>
                      )}

                      {/* Sound toggle button */}
                      <button
                        onClick={toggleMute}
                        className="absolute top-2 right-2 z-20 bg-purple-900/50 p-1 rounded-full"
                      >
                        <span className="text-sm">{soundEnabled ? '🔊' : '🔇'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Rewards table */}
                  <div className="w-full mt-2 overflow-hidden rounded-lg bg-purple-700/60 backdrop-blur-sm border border-purple-500">
                    <div className="text-sm font-medium text-center text-yellow-300 py-2 border-b border-purple-600/50">
                      Possible Rewards
                    </div>
                    <div className="grid grid-cols-4 gap-1 p-2 text-sm">
                      {processedRewards && processedRewards.length > 0 ? (
                        processedRewards
                          .filter(reward => reward.multiplier > 0)
                          .slice(0, 4)
                          .map((reward, index) => (
                            <div key={index} className="bg-purple-800/60 rounded p-2 text-center">
                              <div className="font-bold text-yellow-300">{reward.name}</div>
                              <div className="text-xs text-purple-200">{(reward.probability * 100).toFixed(1)}% chance</div>
                            </div>
                          ))
                      ) : (
                        <>
                          <div className="bg-purple-800/60 rounded p-2 text-center">
                            <div className="font-bold text-yellow-300">5x Tokens</div>
                            <div className="text-xs text-purple-200">2.0% chance</div>
                          </div>
                          <div className="bg-purple-800/60 rounded p-2 text-center">
                            <div className="font-bold text-yellow-300">3x Tokens</div>
                            <div className="text-xs text-purple-200">5.0% chance</div>
                          </div>
                          <div className="bg-purple-800/60 rounded p-2 text-center">
                            <div className="font-bold text-yellow-300">2x Tokens</div>
                            <div className="text-xs text-purple-200">10.0% chance</div>
                          </div>
                          <div className="bg-purple-800/60 rounded p-2 text-center">
                            <div className="font-bold text-yellow-300">1.5x Tokens</div>
                            <div className="text-xs text-purple-200">15.0% chance</div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Result display with enhanced animation and design */}
                  {isRevealed && reward && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="mt-6 bg-purple-700/60 p-5 rounded-xl text-center border border-purple-500 backdrop-blur-sm"
                    >
                      <h3 className="text-2xl font-bold text-yellow-300">
                        {reward.multiplier > 0 && "🎉 "}{reward.name}
                      </h3>
                      <p className="mt-2 text-lg text-white">
                        {reward.multiplier > 0
                          ? `You won ${(parseFloat(betAmount) * reward.multiplier).toFixed(2)} ${String(tokenSymbol)}!`
                          : 'Better luck next time!'}
                      </p>
                      <button
                        onClick={handlePlay}
                        className="mt-4 bg-pink-600 hover:bg-pink-500 font-bold py-3 px-8 rounded-lg transition transform hover:scale-105 active:scale-95 shadow-lg text-white"
                      >
                        Play Again
                      </button>
                    </motion.div>
                  )}

                  {/* Error message */}
                  {error && (
                    <div className="bg-red-800/70 text-white p-4 rounded-lg mt-4 text-sm backdrop-blur-sm border border-red-700/30">
                      <div className="flex items-center">
                        <span className="mr-2">⚠️</span>
                        <span>{error}</span>
                      </div>
                    </div>
                  )}

                  {/* Transaction details */}
                  {txHash && (
                    <div className="mt-4 text-xs text-purple-200 bg-purple-800/30 p-3 rounded-lg backdrop-blur-sm">
                      <div className="flex items-center">
                        <span className="mr-2">🔗</span>
                        <span>Transaction: {txHash.slice(0, 6)}...{txHash.slice(-4)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          // Not connected view
          <div className="text-center p-8 bg-purple-900/50 rounded-xl backdrop-blur-sm border border-purple-600 max-w-lg">
            <div className="text-6xl mb-6">💰</div>
            <h2 className="text-3xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-yellow-500">
              Welcome to Instant Scratch & Win!
            </h2>
            <p className="mb-8 text-purple-200">
              Connect your wallet to start playing and winning tokens!
            </p>
            <div className="inline-block p-2 bg-purple-800/50 rounded-lg backdrop-blur-sm">
              <ConnectButton />
            </div>
            <div className="mt-8 text-sm text-purple-200">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-yellow-300">✓</span>
                  <span>Play with your tokens</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-300">✓</span>
                  <span>Win up to 5x your bet</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-300">✓</span>
                  <span>Instant results - no waiting!</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-300">✓</span>
                  <span>Staking coming soon!</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full p-4 border-t border-purple-600/50 text-center text-sm text-purple-300 backdrop-blur-sm bg-purple-900/30">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
          <p>© 2025 Instant Scratch & Win DApp | Play Responsibly</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-yellow-300 transition">Terms</a>
            <a href="#" className="hover:text-yellow-300 transition">Docs</a>
            <a href="#" className="hover:text-yellow-300 transition">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}