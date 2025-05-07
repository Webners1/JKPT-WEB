"use client";

import { useState, useEffect, useRef } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits, decodeEventLog } from 'viem';
import { motion } from "framer-motion";
import { sepolia } from "viem/chains";
import { SoundManager, SOUNDS } from '../utils/sounds';
import { useApprove } from '../hooks/useApprove';
import { TransactionModal } from '../components/TransactionModal';

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
  const betAmount = 100;
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

  // Transaction modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'success' | 'error' | 'loading'>('loading');
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");

  const scratchSoundRef = useRef<HTMLAudioElement | null>(null);
  const winSoundRef = useRef<HTMLAudioElement | null>(null);
  const startSoundRef = useRef<HTMLAudioElement | null>(null);
  const noWinSoundRef = useRef<HTMLAudioElement | null>(null);
  const scratchPatternRef = useRef<HTMLCanvasElement | null>(null);
  const publicClient = usePublicClient();
  const soundManager = SoundManager.getInstance();

  // Use our custom approval hook
 
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
  const {
    approve,
    isApproving,
    approvalError,
    approvalSuccess,
    approvalHash
  } = useApprove(
    TOKEN_ADDRESS,
    GAME_ADDRESS,
    Number(tokenDecimals) || 18
  );

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

    if (!ctx) return;

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

        // Show error modal
        setModalTitle("Game Paused");
        setModalMessage("The game is currently paused by the operator. Please try again later.");
        setModalType("error");
        setModalOpen(true);
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
        betAmount.toString(),
        Number(tokenDecimals) || 18
      );

      // Check if bet amount is valid
      if (
        (minBet && betAmountInUnits < BigInt(minBet)) ||
        (maxBet && betAmountInUnits > BigInt(maxBet))
      ) {
        const errorMsg = `Bet amount must be between ${formatUnits(BigInt(minBet), Number(tokenDecimals))} and ${formatUnits(BigInt(maxBet), Number(tokenDecimals))} ${String(tokenSymbol)}`;
        throw new Error(errorMsg);
      }

      // Check if user has enough tokens
      if (tokenBalance && betAmountInUnits > BigInt(tokenBalance)) {
        const errorMsg = `Insufficient ${String(tokenSymbol)} balance`;
        throw new Error(errorMsg);
      }

      // Show approval modal
      setModalTitle("Approving Tokens");
      setModalMessage(`Approving ${betAmount} ${String(tokenSymbol)} for the game...`);
      setModalType("loading");
      setModalOpen(true);

      // Use our custom approve hook
      let approvalHash;
      try {
        approvalHash = await approve(
          betAmount.toString(),
          () => {
            // On approval success
            setModalTitle("Approval Successful");
            setModalMessage("Token approval successful. Placing bet...");
            setModalType("success");
          },
          (error) => {
            // On approval error
            setModalTitle("Approval Failed");
            setModalMessage(error.message);
            setModalType("error");
            throw error; // Re-throw to be caught by outer catch
          }
        );
      } catch (error) {
        // This will be caught by the outer catch block
        throw error;
      }

      // Estimate gas for placeBet transaction
      const gasEstimate = await publicClient.estimateContractGas({
        address: GAME_ADDRESS,
        abi: gameABI,
        functionName: "placeBet",
        args: [betAmountInUnits],
        account: address
      });

      // Add 50% buffer to the gas estimate
      const gasWithBuffer = (gasEstimate * BigInt(150)) / BigInt(100);

      // Update modal for bet placement
      setModalTitle("Placing Bet");
      setModalMessage(`Placing bet of ${betAmount} ${String(tokenSymbol)}...`);
      setModalType("loading");

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

      // Close the modal after successful bet placement
      setModalOpen(false);

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
      const errorMessage = err instanceof Error ? err.message : "Failed to play. Please try again.";
      setError(errorMessage);

      // Show error modal
      setModalTitle("Supply Failed");
      setModalMessage(errorMessage);
      setModalType("error");
      setModalOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Draw the reward under the scratch layer
  const drawReward = (rewardItem) => {
    if (!rewardItem || !scratchRef.current) return;

    const canvas = scratchRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

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
      const rewardAmount = (parseFloat(betAmount.toString()) * rewardItem.multiplier).toFixed(2);
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

  // Add state for attempts and win modal
  const [attempt, setAttempt] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('scratch-attempt');
      return stored ? parseInt(stored, 10) : 0;
    }
    return 0;
  });
  const [showWinModal, setShowWinModal] = useState(false);

  // Update attempt in localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('scratch-attempt', attempt.toString());
    }
  }, [attempt]);

  // Scratch result logic
  const isWin = attempt === 1;
  const handleOpenUp = () => {
    if (isWin) {
      setShowWinModal(true);
      setAttempt(0); // Reset for demo, or keep at 2 for one-time win
      if (typeof window !== 'undefined') localStorage.setItem('scratch-attempt', '0');
    } else {
      setAttempt(attempt + 1);
      if (typeof window !== 'undefined') localStorage.setItem('scratch-attempt', (attempt + 1).toString());
    }
  };

  // 1. Change background to a light gold/cream or abstract casino-style image
  const lightGoldBg = 'https://brand-space.ams3.cdn.digitaloceanspaces.com/spin/lady/in_css_f5bf3e730d9927026d0a9e22c05afb35.static.jpg';

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden" style={{ background: `url('${lightGoldBg}') center/cover no-repeat` }}>
      {/* Transaction Status Modal */}
      <TransactionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        type={modalType}
        title={modalTitle}
        message={modalMessage}
        txHash={txHash}
      />
  
      {/* Header with wallet connection */}
      <header className="w-full p-4 flex justify-between items-center border-b border-yellow-600/50 backdrop-blur-sm bg-red-900/90 sticky top-0 z-10">
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
                <div className="bg-red-800 rounded-xl p-6 w-full shadow-lg border border-yellow-600 backdrop-blur-sm">
                  <h2 className="text-xl font-semibold mb-4 flex items-center text-yellow-300">
                    <span className="mr-2">💰</span> Your Balance
                  </h2>
                  <div className="space-y-4">
                    <div className="bg-red-700/80 p-4 rounded-lg backdrop-blur-sm">
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
                    <div className="bg-red-700/80 p-4 rounded-lg backdrop-blur-sm">
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
                <div className="mt-6 bg-red-800 rounded-xl p-6 w-full shadow-lg border border-yellow-600 backdrop-blur-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-yellow-600 text-xs font-bold px-3 py-1 rounded-bl-lg text-white">
                    COMING SOON
                  </div>
                  <h2 className="text-xl font-semibold mb-4 flex items-center text-yellow-300">
                    <span className="mr-2">⚡</span> Token Staking
                  </h2>
                  <p className="text-sm text-yellow-200 mb-4">
                    Stake your tokens to earn passive rewards and exclusive benefits!
                  </p>
                  <div className="bg-red-700/80 p-3 rounded-lg text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-yellow-200">APY:</span>
                      <span className="font-bold text-yellow-300">Up to 25%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-yellow-200">Launch:</span>
                      <span className="text-white">Q2 2025</span>
                    </div>
                  </div>
                  <button className="w-full mt-4 py-2 bg-yellow-600/80 rounded-lg text-white cursor-not-allowed border border-yellow-500">
                    Staking Coming Soon
                  </button>
                </div>
              </div>
  
              {/* Middle and Right Columns - Game Section */}
              <div className="md:col-span-2">
                {/* Game section with loading state */}
                <div className="bg-yellow-50/80 rounded-2xl p-6 w-full shadow-lg border-4 border-yellow-400 backdrop-blur-md">
                  <h2 className="text-xl font-semibold mb-6 flex items-center text-yellow-700">
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
                        className="bg-yellow-100 text-yellow-700 rounded-l-lg p-3 w-full focus:outline-none focus:ring-2 focus:ring-yellow-400 border border-yellow-400 disabled:opacity-50"
                      />
                      <button
                        onClick={handlePlay}
                        disabled={isScratching || loading || isDataLoading}
                        className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white font-bold py-3 px-6 rounded-r-lg transition transform hover:scale-105 active:scale-95 shadow-lg disabled:opacity-50"
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
                    <div className="text-xs mt-2 text-yellow-200 flex justify-between">
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
  
                  {/* Main scratch area with mascot */}
                  <div className="flex flex-row items-center justify-center gap-8 w-full max-w-3xl mx-auto mt-8">
                    {/* Mascot image, vertically centered to the card */}
                    <div className="flex flex-col items-center justify-center h-[420px]">
                      <img src="https://brand-space.ams3.cdn.digitaloceanspaces.com/spin/lady/images/v2.png" alt="Mascot" className="h-[380px] w-auto object-contain drop-shadow-2xl" />
                    </div>
                    {/* Scratch card area */}
                    <div className="flex flex-col items-center bg-transparent">
                      {/* Card outer */}
                      <div className="w-[320px] rounded-[24px] border-4 border-yellow-400 bg-gradient-to-b from-yellow-50 to-yellow-100 shadow-2xl flex flex-col items-center pb-6" style={{ boxShadow: '0 8px 32px 0 rgba(255, 193, 7, 0.15)' }}>
                        {/* Gold header with stars and attempts */}
                        <div className="w-[90%] mx-auto mt-4 mb-4 bg-gradient-to-r from-yellow-400 to-orange-300 py-2 px-4 flex items-center justify-center rounded-xl border-b-2 border-yellow-500 shadow" style={{ minHeight: '48px' }}>
                          <span className="text-yellow-900 text-xl mr-2">★</span>
                          <span className="text-yellow-900 text-xl mr-2">★</span>
                          <span className="text-white font-bold text-base tracking-wide">YOU HAVE 2 ATTEMPTS</span>
                        </div>
                        {/* 3 large horizontal scratch boxes */}
                        <div className="flex flex-col gap-3 w-full px-4 mb-6">
                          {[0,1,2].map((idx) => (
                            <div key={idx} className={`relative border-2 rounded-xl h-20 flex items-center justify-center shadow-md overflow-hidden ${isWin && idx === 1 ? 'bg-gradient-to-br from-yellow-200 to-yellow-100 border-yellow-400' : 'bg-gradient-to-br from-yellow-100 to-yellow-200 border-yellow-300'}`}
                              style={{ background: isWin && idx === 1 ? 'repeating-linear-gradient(135deg, #ffe082, #ffe082 20px, #ffd54f 20px, #ffd54f 40px)' : 'repeating-linear-gradient(135deg, #f8e9c1, #f8e9c1 20px, #f3d88e 20px, #f3d88e 40px)' }}>
                              {/* Diagonal watermark or result */}
                              <span className="absolute left-1/2 top-1/2 text-[20px] font-bold select-none" style={{ transform: 'translate(-50%, -50%) rotate(-20deg)', pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap', letterSpacing: '2px', color: isWin && idx === 1 ? '#d4af37' : '#e0b200', opacity: 0.7 }}>
                                {isWin && idx === 1 ? '🎉 WIN!' : 'Scratch here'}
                              </span>
                            </div>
                          ))}
                        </div>
                        {/* OPEN UP button */}
                        <button onClick={handleOpenUp} className="mt-2 bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-yellow-300 hover:to-orange-300 text-white font-bold py-4 px-16 rounded-full text-xl shadow-lg border-4 border-white transition-all duration-200 tracking-wide relative" style={{ boxShadow: '0 0 16px 2px #fffbe7, 0 4px 24px 0 #ff9800' }}>
                          OPEN UP
                        </button>
                        {/* Show a message for loss */}
                        {!isWin && attempt === 1 && (
                          <div className="mt-4 text-lg font-bold text-red-500">Try Again!</div>
                        )}
                      </div>
                    </div>
                  </div>
  
                  {/* Rewards table */}
                  <div className="w-full mt-2 overflow-hidden rounded-lg bg-yellow-50 border border-yellow-400">
                    <div className="text-sm font-medium text-center text-yellow-700 py-2 border-b border-yellow-600/50">
                      Possible Rewards
                    </div>
                    <div className="grid grid-cols-4 gap-1 p-2 text-sm">
                      {processedRewards && processedRewards.length > 0 ? (
                        processedRewards
                          .filter(reward => reward.multiplier > 0)
                          .slice(0, 4)
                          .map((reward, index) => (
                            <div key={index} className="bg-yellow-100 rounded p-2 text-center">
                              <div className="font-bold text-yellow-700">{reward.name}</div>
                              <div className="text-xs text-yellow-200">{(reward.probability * 100).toFixed(1)}% chance</div>
                            </div>
                          ))
                      ) : (
                        <>
                          <div className="bg-yellow-100 rounded p-2 text-center">
                            <div className="font-bold text-yellow-700">5x Tokens</div>
                            <div className="text-xs text-yellow-200">2.0% chance</div>
                          </div>
                          <div className="bg-yellow-100 rounded p-2 text-center">
                            <div className="font-bold text-yellow-700">3x Tokens</div>
                            <div className="text-xs text-yellow-200">5.0% chance</div>
                          </div>
                          <div className="bg-yellow-100 rounded p-2 text-center">
                            <div className="font-bold text-yellow-700">2x Tokens</div>
                            <div className="text-xs text-yellow-200">10.0% chance</div>
                          </div>
                          <div className="bg-yellow-100 rounded p-2 text-center">
                            <div className="font-bold text-yellow-700">1.5x Tokens</div>
                            <div className="text-xs text-yellow-200">15.0% chance</div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
  
                  {/* Win Celebration Modal - This appears on win */}
                  {showWinModal && (
                    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/70">
                      <div className="bg-gradient-to-b from-yellow-100 to-yellow-300 border-4 border-yellow-400 rounded-2xl shadow-2xl p-10 max-w-md w-full text-center relative animate-bounce">
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-20 h-20 bg-yellow-400 rounded-full flex items-center justify-center text-4xl shadow-lg border-4 border-yellow-300">🎉</div>
                        <h2 className="text-3xl font-bold text-yellow-800 mb-4 mt-8">Congratulations!</h2>
                        <p className="text-xl text-yellow-700 mb-6">You won 100 JKPT!</p>
                        <button onClick={() => setShowWinModal(false)} className="py-4 px-12 bg-gradient-to-r from-yellow-400 to-orange-400 text-white font-bold rounded-full text-xl shadow-lg border-2 border-white transition-all duration-200 tracking-wide">CLAIM HERE</button>
                      </div>
                    </div>
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
                    <div className="mt-4 text-xs text-yellow-200 bg-red-800/30 p-3 rounded-lg backdrop-blur-sm">
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
          <div className="text-center p-8 bg-red-900/50 rounded-xl backdrop-blur-sm border border-yellow-600 max-w-lg">
            <div className="text-6xl mb-6">💰</div>
            <h2 className="text-3xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-yellow-500">
              Welcome to Instant Scratch & Win!
            </h2>
            <p className="mb-8 text-yellow-200">
              Connect your wallet to start playing and winning tokens!
            </p>
            <div className="inline-block p-2 bg-red-800/50 rounded-lg backdrop-blur-sm">
              <ConnectButton />
            </div>
            <div className="mt-8 text-sm text-yellow-200">
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
      <footer className="w-full p-4 border-t border-yellow-600/50 text-center text-sm text-yellow-300 backdrop-blur-sm bg-red-900/30">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
          <p>© 2025 Instant Scratch & Win DApp | Play Responsibly</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-yellow-400 transition">Terms</a>
            <a href="#" className="hover:text-yellow-400 transition">Docs</a>
            <a href="#" className="hover:text-yellow-400 transition">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}