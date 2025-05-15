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
  const [betAmount, setBetAmount] = useState(100);
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
      try {
        initializeScratchCard();
      } catch (error) {
        console.error("Error initializing scratch card:", error);
        // Don't set canvasLoaded to true if initialization failed
      }
    }
  }, [isConnected, canvasLoaded]);

  // Re-initialize canvas when needed (e.g., after component updates)
  useEffect(() => {
    // This will ensure canvas is initialized after DOM is fully loaded
    const timer = setTimeout(() => {
      if (isConnected && canvasRef.current && !canvasLoaded) {
        try {
          initializeScratchCard();

          // Initialize the result canvas with a placeholder
          if (scratchRef.current) {
            const scratchCanvas = scratchRef.current;
            const scratchCtx = scratchCanvas.getContext('2d');
            if (scratchCtx) {
              drawPlaceholder(scratchCtx, scratchCanvas.width, scratchCanvas.height);
            }
          }
        } catch (error) {
          console.error("Delayed canvas initialization failed:", error);
        }
      }
    }, 500); // Small delay to ensure DOM is ready

    return () => clearTimeout(timer);
  }, [isConnected, canvasLoaded]);

  const initializeScratchCard = () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) {
        console.error("Canvas reference is null");
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error("Failed to get 2D context from canvas");
        return;
      }

      // Set canvas dimensions
      canvas.width = 300;
      canvas.height = 200;

      // Create rich golden gradient background for a premium scratch card look
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, '#FFD700');  // Gold
      gradient.addColorStop(0.2, '#FFC125'); // Deep gold
      gradient.addColorStop(0.4, '#FFD700'); // Gold
      gradient.addColorStop(0.6, '#FFDF00'); // Golden yellow
      gradient.addColorStop(0.8, '#FFC125'); // Deep gold
      gradient.addColorStop(1, '#FFD700');   // Gold

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Add a luxurious golden border
      ctx.strokeStyle = '#B8860B'; // Dark golden rod
      ctx.lineWidth = 4;
      ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

      // Add rich gold texture to the scratch surface
      for (let i = 0; i < 200; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = Math.random() * 2 + 0.5;

        // Use various gold shades for a richer texture
        const goldColors = ['#FFD700', '#FFC125', '#DAA520', '#B8860B', '#CD853F'];
        const randomGold = goldColors[Math.floor(Math.random() * goldColors.length)];

        ctx.fillStyle = randomGold;
        ctx.globalAlpha = Math.random() * 0.2 + 0.05; // Very subtle opacity
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0; // Reset opacity

      // Apply scratch pattern
      if (scratchPatternRef.current) {
        const pattern = ctx.createPattern(scratchPatternRef.current, 'repeat');
        if (pattern) {
          ctx.globalAlpha = 0.15; // Make pattern subtle
          ctx.fillStyle = pattern;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = 1.0;
        } else {
          // Fallback if pattern creation fails
          fallbackPattern(ctx, canvas);
        }
      } else {
        // Fallback to simple pattern if custom pattern isn't available
        fallbackPattern(ctx, canvas);
      }

      // Add gold shimmer effects
      for (let i = 0; i < 120; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = Math.random() * 1.2 + 0.3;

        // Create shimmering effect with white/gold sparkles
        ctx.fillStyle = Math.random() > 0.7 ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 215, 0, 0.6)';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Add subtle gold coin pattern in the background
      for (let i = 0; i < 10; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = Math.random() * 15 + 10;

        ctx.strokeStyle = 'rgba(218, 165, 32, 0.1)'; // Very subtle golden brown
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.stroke();
      }

      setCanvasLoaded(true);
    } catch (error) {
      console.error("Error in initializeScratchCard:", error);
      // Set canvas loaded to true anyway to prevent infinite retries
      setCanvasLoaded(true);
    }
  };

  // Helper function for fallback pattern
  const fallbackPattern = (ctx, canvas) => {
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
  };

  // Draw placeholder for the scratch card result
  const drawPlaceholder = (ctx, width, height) => {
    if (!ctx) return;

    // Clear the canvas
    ctx.clearRect(0, 0, width, height);

    // Create a neutral background
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#f5f5f5');
    gradient.addColorStop(1, '#e0e0e0');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Add subtle pattern
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() * 2 + 0.5;

      ctx.fillStyle = `rgba(200, 200, 200, 0.3)`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Add a subtle question mark or icon in the center
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(150, 150, 150, 0.2)';
    ctx.fillText('?', width / 2, height / 2);
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
    try {
      if (!isScratching || !canvasRef.current) return;

      // Only scratch if left mouse button is pressed
      if (e.type === 'mousemove' && e.buttons !== 1) return;

      e.preventDefault();

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error("Failed to get 2D context from canvas in handleScratch");
        return;
      }

      const rect = canvas.getBoundingClientRect();

      // Get cursor position relative to canvas
      const currentX = (e.clientX || (e.touches && e.touches[0]?.clientX)) - rect.left;
      const currentY = (e.clientY || (e.touches && e.touches[0]?.clientY)) - rect.top;

      if (currentX === undefined || currentY === undefined || isNaN(currentX) || isNaN(currentY)) return;

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

      try {
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
              // Show win modal after a short delay for second attempt (win)
              if (attempt === 2) {
                setTimeout(() => {
                  setShowWinModal(true);
                }, 1000);
              }
            } else {
              soundManager.play('NO_WIN');
            }
          }
        }
      } catch (imageError) {
        console.error("Error processing image data:", imageError);
      }
    } catch (error) {
      console.error("Error in handleScratch:", error);
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

    // Check if user has attempts left
    if (attemptsExhausted) {
      setError("You've used all your attempts for this wallet address. Try with a different wallet.");
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

      // Show appropriate message based on attempt number
      const attemptMessage = attempt === 0
        ? "First attempt - paying for your first scratch card"
        : "Second attempt - paying for your final scratch card";

      console.log(attemptMessage);

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
      try {
        await approve(
          betAmount.toString(),
          () => {
            // On approval success
            setModalTitle("Approval Successful");
            setModalMessage("Token approval successful. Placing bet...");
            setModalType("success");

            // Add a small delay to show the success message before proceeding
            setTimeout(() => {
              // Continue with placing the bet
              placeBetAfterApproval(betAmountInUnits);
            }, 1500);
          },
          (error) => {
            // On approval error
            setModalTitle("Approval Failed");
            setModalMessage(error.message);
            setModalType("error");
            setModalOpen(false); // Close the modal on error
            setLoading(false); // Stop loading state
            throw error; // Re-throw to be caught by outer catch
          }
        );

        // Return early - the bet placement will be handled by the callback
        return;
      } catch (error) {
        // This will be caught by the outer catch block
        setModalOpen(false); // Make sure modal is closed on error
        throw error;
      }

      // This code is unreachable due to the return statement above
      // The bet placement is now handled by placeBetAfterApproval function
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

  // Function to place bet after approval
  const placeBetAfterApproval = async (betAmountInUnits: bigint) => {
    try {
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
        const { multiplier } = decodedLog.args;
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

        // Update attempt count based on current attempt
        // First attempt always loses, second attempt always wins
        if (attempt === 0) {
          // This is the first attempt (will result in loss)
          setAttempt(1);
          console.log("First attempt - paying for your first scratch card");

          // Force the result to be a loss for first attempt
          rewardTier.multiplier = 0;
          rewardTier.name = "No Win";
          rewardTier.color = "#555555";
        } else if (attempt === 1) {
          // This is the second attempt (will result in win)
          setAttempt(2);
          console.log("Second attempt - paying for your second scratch card");

          // Force the result to be a win for second attempt
          rewardTier.multiplier = 2;
          rewardTier.name = "2x Tokens";
          rewardTier.color = "#FFD700";
        }

        // Prepare the reward display on scratch card
        if (scratchRef.current) {
          drawReward(rewardTier);
        }
      } else {
        throw new Error("Failed to get game result from transaction logs");
      }
    } catch (error) {
      console.error("Error placing bet after approval:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to place bet. Please try again.";

      // Show error in modal if it's open
      if (modalOpen) {
        setModalTitle("Error");
        setModalMessage(errorMessage);
        setModalType("error");
      } else {
        setError(errorMessage);
      }

      setLoading(false);
    }
  };

  // Draw the reward under the scratch layer
  const drawReward = (rewardItem) => {
    try {
      if (!rewardItem || !scratchRef.current) return;

      const canvas = scratchRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        console.error("Failed to get 2D context from reward canvas");
        return;
      }

      // Clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        // Create a radial gradient background
        const gradient = ctx.createRadialGradient(
          canvas.width / 2, canvas.height / 2, 10,
          canvas.width / 2, canvas.height / 2, canvas.width / 2
        );

        // Always use golden colors for the background for win (second attempt)
        // For win (second attempt)
        if (isWin) {
          gradient.addColorStop(0, '#FFD700');  // Gold
          gradient.addColorStop(0.5, '#FFC125'); // Deep gold
          gradient.addColorStop(1, '#DAA520');  // Golden brown
        }
        // For loss (first attempt)
        else {
          gradient.addColorStop(0, '#555555');  // Dark gray
          gradient.addColorStop(0.5, '#444444'); // Medium gray
          gradient.addColorStop(1, '#333333');  // Light gray
        }

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

        // We're not using the multiplier from rewardItem since we're hardcoding the win/loss

        // Always base the win/loss on the attempt number, not the multiplier
        // Second attempt (index 1) is always a win
        if (attempt === 1) {
          // Draw "YOU WIN!" text
          ctx.font = "bold 48px Arial";
          ctx.fillText("YOU WIN!", canvas.width / 2, 70);

          // Draw reward amount
          ctx.font = "bold 40px Arial";
          const betAmountValue = parseFloat(betAmount?.toString() || "0");
          const rewardAmount = (betAmountValue * 2).toFixed(0); // Fixed 2x multiplier
          ctx.fillText(`${rewardAmount}`, canvas.width / 2, canvas.height / 2 - 10);

          // Draw token symbol
          ctx.font = "bold 24px Arial";
          ctx.fillText(String(tokenSymbol || "JKPT"), canvas.width / 2, canvas.height / 2 + 20);

          // Draw multiplier
          ctx.font = "bold 28px Arial";
          ctx.fillText("2x Multiplier!", canvas.width / 2, canvas.height - 40);

          // Add celebration effects
          if (typeof drawCelebration === 'function') {
            drawCelebration(ctx, canvas.width, canvas.height, '#FFD700');
          }
        }
        // First attempt (index 0) is always a loss
        else {
          // Draw "NO WIN" text
          ctx.font = "bold 48px Arial";
          ctx.fillText("NO WIN", canvas.width / 2, canvas.height / 2 - 20);

          // Draw "Try Again!" text
          ctx.font = "bold 28px Arial";
          ctx.fillText("Try Again!", canvas.width / 2, canvas.height / 2 + 30);
        }

        // Reset shadow
        ctx.shadowColor = 'transparent';
      } catch (renderError) {
        console.error("Error rendering reward:", renderError);

        // Fallback to simple rendering if complex rendering fails
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        ctx.font = "bold 24px Arial";
        ctx.textAlign = "center";
        ctx.fillText(rewardItem.multiplier > 0 ? "YOU WIN!" : "NO WIN", canvas.width / 2, canvas.height / 2);
      }
    } catch (error) {
      console.error("Error in drawReward:", error);
    }
  };

  const toggleMute = () => {
    const isMuted = soundManager.toggleMute();
    // Update UI to reflect mute state
  };

  // Add state for attempts and win modal
  const [attempt, setAttempt] = useState(0);
  const [showWinModal, setShowWinModal] = useState(false);
  const [attemptsExhausted, setAttemptsExhausted] = useState(false);

  // Load attempts from localStorage based on wallet address
  useEffect(() => {
    if (typeof window !== 'undefined' && address) {
      const walletKey = `scratch-attempt-${address}`;
      const stored = localStorage.getItem(walletKey);
      const storedAttempt = stored ? parseInt(stored, 10) : 0;

      // If user has already used both attempts, mark as exhausted
      if (storedAttempt >= 2) {
        setAttemptsExhausted(true);
      }

      setAttempt(storedAttempt);
    }
  }, [address]);

  // Update attempt in localStorage based on wallet address
  useEffect(() => {
    if (typeof window !== 'undefined' && address) {
      const walletKey = `scratch-attempt-${address}`;
      localStorage.setItem(walletKey, attempt.toString());

      // If user has used both attempts, mark as exhausted
      if (attempt >= 2) {
        setAttemptsExhausted(true);
      }
    }
  }, [attempt, address]);

  // Scratch result logic - First attempt always loses, second attempt always wins
  const isWin = attempt === 1; // Win on second attempt (index 1)
  const hasAttemptsLeft = attempt < 2; // Check if user still has attempts left

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
                        onChange={(e) => setBetAmount(Number(e.target.value) || 0)}
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
                        ) : (
                          <span className="flex items-center">
                            <span className="mr-1">💰</span>
                            {attempt === 0 ? "Pay & Play" : attempt === 1 ? "Pay & Try Again" : "Play Now"}
                          </span>
                        )}
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

                    {/* Payment notice */}
                    <div className="mt-3 text-center text-sm text-yellow-300 bg-red-900/30 p-2 rounded-lg">
                      <p className="flex items-center justify-center font-bold">
                        <span className="mr-1">💰</span>
                        EACH SCRATCH REQUIRES A SEPARATE PAYMENT
                      </p>
                      <p className="mt-1 text-xs">
                        {attempt === 0
                          ? "This is your first attempt. Pay to play!"
                          : attempt === 1
                            ? "First attempt used. Pay again for your second attempt!"
                            : "You've used both attempts for this wallet address."}
                      </p>
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
                          <span className="text-white font-bold text-base tracking-wide">
                            {attemptsExhausted
                              ? "NO ATTEMPTS LEFT"
                              : `YOU HAVE ${2 - attempt} ATTEMPT${2 - attempt !== 1 ? 'S' : ''}`}
                          </span>
                        </div>

                        {/* Scratch card canvas container - Main scratch area */}
                        <div className="relative w-[300px] h-[200px] mb-4 overflow-hidden rounded-lg border-2 border-yellow-500 shadow-lg">
                          {/* Result canvas (underneath) - Shows win/loss result */}
                          <canvas
                            ref={scratchRef}
                            width="300"
                            height="200"
                            className="absolute top-0 left-0 w-full h-full"
                          />

                          {/* Scratch overlay canvas (on top) - Golden scratch surface */}
                          <canvas
                            ref={canvasRef}
                            width="300"
                            height="200"
                            className="absolute top-0 left-0 w-full h-full cursor-pointer"
                            onMouseDown={handleScratchStart}
                            onMouseMove={handleScratch}
                            onMouseUp={handleScratchEnd}
                            onMouseLeave={handleScratchEnd}
                            onTouchStart={handleScratchStart}
                            onTouchMove={handleScratch}
                            onTouchEnd={handleScratchEnd}
                          />
                        </div>

                        {/* Status message based on scratch state */}
                        {isScratching ? (
                          <div className="mt-4 text-lg font-bold text-center">
                            <span className="text-yellow-500">Scratch to reveal your result!</span>
                          </div>
                        ) : isRevealed ? (
                          <div className="mt-4 text-lg font-bold text-center">
                            {isWin ? (
                              <span className="text-green-500">Congratulations! You won!</span>
                            ) : (
                              <span className="text-red-500">No win this time. Try again!</span>
                            )}
                          </div>
                        ) : (
                          <div className="mt-4 text-lg font-bold text-center text-yellow-600">
                            Pay to play a new scratch card
                          </div>
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
                        <p className="text-xl text-yellow-700 mb-4">
                          You won {(betAmount * 2).toFixed(0)} {tokenSymbol || "JKPT"}!
                        </p>
                        <p className="text-sm text-yellow-600 mb-6">
                          Visit <a href="https://jackpt.com/redeem" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-bold">jackpt.com/redeem</a> to claim your prize!
                        </p>
                        <button
                          onClick={() => {
                            setShowWinModal(false);
                            // Reset the scratch card for a new game
                            initializeScratchCard();
                            // Open redemption page in new tab
                            window.open('https://jackpt.com/redeem', '_blank');
                          }}
                          className="py-4 px-12 bg-gradient-to-r from-yellow-400 to-orange-400 text-white font-bold rounded-full text-xl shadow-lg border-2 border-white transition-all duration-200 tracking-wide hover:from-yellow-300 hover:to-orange-300"
                        >
                          CLAIM NOW
                        </button>
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
              Welcome to JACKPT!
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