"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { SoundManager, SOUNDS } from '../utils/sounds';
import { ConnectButton } from "@rainbow-me/rainbowkit";

// Types for better type safety
type Reward = {
  multiplier: number;
  name: string;
  color: string;
  probability: number;
};

export default function EnhancedScratchAndWin() {
  const { address, isConnected } = useAccount();
  const [isScratching, setIsScratching] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement>(null);
  const [canvasLoaded, setCanvasLoaded] = useState(false);
  const [percentScratched, setPercentScratched] = useState(0);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);
  const [gamePaused, setGamePaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Transaction modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'success' | 'error' | 'loading'>('loading');
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");

  // Sound references
  const scratchSoundRef = useRef<HTMLAudioElement | null>(null);
  const winSoundRef = useRef<HTMLAudioElement | null>(null);
  const startSoundRef = useRef<HTMLAudioElement | null>(null);
  const noWinSoundRef = useRef<HTMLAudioElement | null>(null);
  const scratchPatternRef = useRef<HTMLCanvasElement | null>(null);
  const soundManager = SoundManager.getInstance();

  // Add state for attempts and win modal
  const [attempt, setAttempt] = useState(0);
  const [attemptsExhausted, setAttemptsExhausted] = useState(false);

  // Track if the card has been drawn
  const [cardDrawn, setCardDrawn] = useState(false);

  // Add background image states for better theming
  const [scratchBgImage] = useState<HTMLImageElement | null>(null);
  const [coinPattern, setCoinPattern] = useState<CanvasPattern | null>(null);

  // Initialize the backgrounds and patterns
  useEffect(() => {
    const loadImages = async () => {
      // Create a gold coin pattern for backgrounds
      const patternCanvas = document.createElement('canvas');
      patternCanvas.width = 60;
      patternCanvas.height = 60;
      const patternCtx = patternCanvas.getContext('2d');

      if (patternCtx) {
        // Gold background
        patternCtx.fillStyle = '#f8d568';
        patternCtx.fillRect(0, 0, 60, 60);

        // Draw coin circles
        patternCtx.strokeStyle = '#e4b528';
        patternCtx.lineWidth = 1;

        patternCtx.beginPath();
        patternCtx.arc(30, 30, 20, 0, Math.PI * 2);
        patternCtx.stroke();

        patternCtx.beginPath();
        patternCtx.arc(0, 0, 15, 0, Math.PI * 2);
        patternCtx.stroke();

        patternCtx.beginPath();
        patternCtx.arc(60, 0, 15, 0, Math.PI * 2);
        patternCtx.stroke();

        patternCtx.beginPath();
        patternCtx.arc(0, 60, 15, 0, Math.PI * 2);
        patternCtx.stroke();

        patternCtx.beginPath();
        patternCtx.arc(60, 60, 15, 0, Math.PI * 2);
        patternCtx.stroke();

        // Add $ symbols
        patternCtx.font = '16px Arial';
        patternCtx.fillStyle = '#e4b528';
        patternCtx.textAlign = 'center';
        patternCtx.textBaseline = 'middle';
        patternCtx.fillText('$', 30, 30);
      }

      // Create the canvas pattern to use later
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx && patternCanvas) {
          const pattern = ctx.createPattern(patternCanvas, 'repeat');
          if (pattern) {
            setCoinPattern(pattern);
          }
        }
      }
    };

    loadImages();
  }, []);

  // Initialize scratch canvas
  useEffect(() => {
    if (canvasRef.current && scratchRef.current) {
      const canvas = canvasRef.current;
      const scratchCanvas = scratchRef.current;

      // Set canvas dimensions
      canvas.width = 300;
      canvas.height = 300;
      scratchCanvas.width = 300;
      scratchCanvas.height = 300;

      // Create scratch pattern texture
      createScratchPattern();

      setCanvasLoaded(true);
    }
  }, []);

  // Create a scratch pattern with texture
  const createScratchPattern = () => {
    try {
      const patternCanvas = document.createElement('canvas');
      patternCanvas.width = 300;
      patternCanvas.height = 300;
      scratchPatternRef.current = patternCanvas;

      const ctx = patternCanvas.getContext('2d');
      if (ctx) {
        // Create a gold gradient background to match the image
        const gradient = ctx.createLinearGradient(0, 0, 300, 300);
        gradient.addColorStop(0, '#FFD700');
        gradient.addColorStop(0.5, '#FFC107');
        gradient.addColorStop(1, '#FF8F00');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 300, 300);

        // Add some texture to the scratch layer
        for (let i = 0; i < 5000; i++) {
          const x = Math.random() * 300;
          const y = Math.random() * 300;
          const radius = Math.random() * 1.5;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.15})`;
          ctx.fill();
        }

        // Add "SCRATCH HERE" text with shadow effect
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;

        ctx.font = "bold 28px Arial";
        ctx.fillStyle = "#8B4513";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("SCRATCH HERE", 150, 150);

        // Remove shadow for the rest
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Add a money bag symbol
        ctx.font = "44px Arial";
        ctx.fillStyle = "#8B4513";
        ctx.fillText("💰", 150, 90);

        // Add a decorative border
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 5;
        ctx.strokeRect(10, 10, 280, 280);

        // Add inner decorative border
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(15, 15, 270, 270);

        // Add corner embellishments
        const drawCorner = (x: number, y: number, rotation: number) => {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rotation * Math.PI / 180);

          // Draw a small decorative corner piece
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(20, 0);
          ctx.lineTo(0, 20);
          ctx.closePath();
          ctx.fillStyle = 'rgba(70, 70, 70, 0.5)';
          ctx.fill();

          ctx.restore();
        };

        drawCorner(8, 8, 0);
        drawCorner(292, 8, 90);
        drawCorner(292, 292, 180);
        drawCorner(8, 292, 270);

        // Add subtle radial gradient overlay
        const radialGradient = ctx.createRadialGradient(150, 150, 10, 150, 150, 150);
        radialGradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
        radialGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.0)');
        radialGradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
        ctx.fillStyle = radialGradient;
        ctx.fillRect(0, 0, 300, 300);
      }

      // Now that the pattern is created, initialize the scratch card
      initializeScratchCard();
    } catch (error) {
      console.error("Error creating scratch pattern:", error);
    }
  };

  // Initialize scratch card
  const initializeScratchCard = () => {
    if (scratchRef.current && scratchPatternRef.current) {
      const scratchCanvas = scratchRef.current;
      const ctx = scratchCanvas.getContext('2d');

      if (ctx) {
        // Clear the canvas
        ctx.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);

        // Draw the pattern onto the scratch layer
        ctx.drawImage(scratchPatternRef.current, 0, 0);

        // Remove any existing event listeners first to prevent duplicates
        scratchCanvas.removeEventListener('mousedown', startScratching);
        scratchCanvas.removeEventListener('mousemove', scratch);
        scratchCanvas.removeEventListener('mouseup', stopScratching);
        scratchCanvas.removeEventListener('mouseleave', stopScratching);
        scratchCanvas.removeEventListener('touchstart', handleTouchStart);
        scratchCanvas.removeEventListener('touchmove', handleTouchMove);
        scratchCanvas.removeEventListener('touchend', handleTouchEnd);

        // Add event listeners for scratching
        scratchCanvas.addEventListener('mousedown', startScratching);
        scratchCanvas.addEventListener('mousemove', scratch);
        scratchCanvas.addEventListener('mouseup', stopScratching);
        scratchCanvas.addEventListener('mouseleave', stopScratching);

        // Touch events
        scratchCanvas.addEventListener('touchstart', handleTouchStart);
        scratchCanvas.addEventListener('touchmove', handleTouchMove);
        scratchCanvas.addEventListener('touchend', handleTouchEnd);
      }

      setCardDrawn(false);
    }
  };

  // Scratching functionality
  const startScratching = (e: MouseEvent) => {
    if (!isScratching) return;

    const canvas = scratchRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setLastPoint({ x, y });
    scratch(e);

    // Play scratch sound
    try {
      soundManager.play("SCRATCH");
    } catch (e) {
      console.error("Error playing sound:", e);
    }
  };

  const scratch = (e: MouseEvent) => {
    if (!isScratching || !lastPoint) return;

    const canvas = scratchRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fill();

    // Draw line from last point
    ctx.lineWidth = 30;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    setLastPoint({ x, y });

    // Calculate percentage scratched
    calculateScratchPercentage();
  };

  const stopScratching = () => {
    setLastPoint(null);
  };

  // Touch event handlers
  const handleTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    if (!isScratching) return;

    const canvas = scratchRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    setLastPoint({ x, y });
    handleTouchMove(e);

    // Play scratch sound
    try {
      soundManager.play("SCRATCH");
    } catch (e) {
      console.error("Error playing sound:", e);
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    if (!isScratching || !lastPoint) return;

    const canvas = scratchRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fill();

    // Draw line from last point
    ctx.lineWidth = 30;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    setLastPoint({ x, y });

    // Calculate percentage scratched
    calculateScratchPercentage();
  };

  const handleTouchEnd = () => {
    setLastPoint(null);
  };

  // Calculate percentage of scratch card that has been scratched
  const calculateScratchPercentage = () => {
    if (!scratchRef.current) return;

    const canvas = scratchRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixelData = imageData.data;

    let transparentPixels = 0;
    let totalPixels = pixelData.length / 4;

    for (let i = 3; i < pixelData.length; i += 4) {
      if (pixelData[i] === 0) {
        transparentPixels++;
      }
    }

    const percentage = (transparentPixels / totalPixels) * 100;
    setPercentScratched(percentage);

    // If more than 50% is scratched, consider it revealed
    if (percentage > 50 && !isRevealed) {
      setIsRevealed(true);

      // Play appropriate sound based on win/lose
      if (reward && reward.multiplier > 0) {
        try {
          soundManager.play("WIN");
        } catch (e) {
          console.error("Error playing sound:", e);
        }

        // Show win modal after small delay
        setTimeout(() => {
          setModalOpen(true);
          setModalTitle("🎉 Congratulations! You Won! 🎉");
          setModalMessage(
            "You've won 200 JKPT tokens!\n\n" +
            "✨ IMPORTANT: To claim your prize, you must visit:\n" +
            "https://jackpt.com/redeem\n\n" +
            "Don't miss out on your reward! Click the link now to complete your redemption."
          );
          setModalType("success");
        }, 1500);
      } else {
        try {
          soundManager.play("NO_WIN");
        } catch (e) {
          console.error("Error playing sound:", e);
        }

        // Show loss modal after small delay
        setTimeout(() => {
          setModalOpen(true);
          setModalTitle("Better Luck Next Time!");
          setModalMessage("You didn't win this time. Don't worry - you have one more attempt remaining!\n\nTry again for a chance to win 200 JKPT tokens.");
          setModalType("error");
        }, 1500);
      }

      // Stop scratching after reveal
      setIsScratching(false);
    }
  };

  // Start the game - simplified version without transactions
  const handlePlay = async () => {
    if (!isConnected || loading || (gamePaused === true)) {
      if (!isConnected) {
        // Show wallet connection message
        setModalTitle("Connect Wallet");
        setModalMessage("Please connect your wallet to play the game.");
        setModalType("error");
        setModalOpen(true);
        return;
      }

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

      // Show error modal
      setModalTitle("No Attempts Left");
      setModalMessage("You've used all your attempts for this wallet address. Try with a different wallet.");
      setModalType("error");
      setModalOpen(true);
      return;
    }

    try {
      setLoading(true);
      setError("");
      setReward(null);
      setIsRevealed(false);
      setPercentScratched(0);

      // Explicitly set scratching to false while we prepare the card
      setIsScratching(false);

      // Play card flip sound
      try {
        soundManager.play("CARD_FLIP");
      } catch (e) {
        console.error("Error playing sound:", e);
      }

      // Brief loading delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // Create the scratch pattern
      createScratchPattern();

      // Reset and reinitialize the scratch card
      initializeScratchCard();

      // Simulate the game result without blockchain transactions
      simulateGameResult();

    } catch (error) {
      console.error("Error playing game:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to play. Please try again.";

      // Show error modal
      setModalTitle("Error");
      setModalMessage(errorMessage);
      setModalType("error");
      setModalOpen(true);
      try {
        soundManager.play("NO_WIN");
      } catch (e) {
        console.error("Error playing sound:", e);
      }
      setLoading(false);
    }
  };

  // Function to simulate game result without blockchain transactions
  const simulateGameResult = () => {
    try {
      console.log("Simulating game result without blockchain transactions");

      // Create a reward tier based on the attempt number
      let rewardTier: Reward;

      // First attempt always loses, second attempt always wins
      if (attempt === 0) {
        // First attempt - always lose
        rewardTier = {
          multiplier: 0,
          name: "No Win",
          color: "#555555",
          probability: 0
        };

        // Update attempt count
        setAttempt(1);
        console.log("First attempt - result is a loss");

        // Set the reward to display in UI
        setReward(rewardTier);

        // Prepare the reward display on scratch card
        if (canvasRef.current) {
          drawReward(rewardTier);
        }

        // Allow scratching after a short delay to ensure everything is ready
        setTimeout(() => {
          setIsScratching(true);
          setLoading(false);
        }, 300);
      } else {
        // Second attempt - always win
        rewardTier = {
          multiplier: 2,
          name: "2x Tokens",
          color: "#FFD700",
          probability: 0
        };

        // Update attempt count
        setAttempt(2);
        console.log("Second attempt - result is a win");

        // Set the reward to display in UI
        setReward(rewardTier);

        // Prepare the reward display on scratch card
        if (canvasRef.current) {
          drawReward(rewardTier);
        }

        // Allow scratching after a short delay to ensure everything is ready
        setTimeout(() => {
          setIsScratching(true);
          setLoading(false);
        }, 300);
      }

      // Loading state is handled in the timeouts above
    } catch (error) {
      console.error("Error simulating game result:", error);
      setModalTitle("Error");
      setModalMessage("An error occurred while simulating the game result.");
      setModalType("error");
      setModalOpen(true);
      setLoading(false);
    }
  };

  // Draw the reward under the scratch layer
  const drawReward = (rewardItem: Reward) => {
    try {
      if (!rewardItem || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        console.error("Could not get canvas context");
        return;
      }

      // Mark card as drawn to avoid re-drawing
      setCardDrawn(true);

      // Clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // First create a background pattern
      if (rewardItem.multiplier > 0) {
        // Win state - Gold background with bright elements

        // Draw a radial gradient background
        const bgGradient = ctx.createRadialGradient(
          canvas.width/2, canvas.height/2, 10,
          canvas.width/2, canvas.height/2, canvas.width
        );
        bgGradient.addColorStop(0, '#FFF6C5');
        bgGradient.addColorStop(0.5, '#FFE75A');
        bgGradient.addColorStop(1, '#FFD700');

        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Add a decorative border
        ctx.strokeStyle = '#B8860B'; // Dark gold
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

        // Add inner decorative border
        ctx.strokeStyle = '#FFDB58'; // Light gold
        ctx.lineWidth = 2;
        ctx.strokeRect(15, 15, canvas.width - 30, canvas.height - 30);

        // Draw golden coins scattered around
        for (let i = 0; i < 15; i++) {
          // Position coins around the edges to not interfere with text
          let x: number = 0, y: number = 0;

          if (i < 5) {
            // Top area
            x = 20 + (i * 60);
            y = 40 + (Math.random() * 30);
          } else if (i < 10) {
            // Bottom area
            x = 20 + ((i - 5) * 60);
            y = canvas.height - 40 - (Math.random() * 30);
          } else {
            // Sides
            if (i % 2 === 0) {
              x = 30 + (Math.random() * 20);
            } else {
              x = canvas.width - 30 - (Math.random() * 20);
            }
            y = 70 + (Math.random() * (canvas.height - 140));
          }

          const size = 20 + (Math.random() * 15);

          // Draw coin with shading
          const coinGrad = ctx.createRadialGradient(
            x - size/4, y - size/4, 0,
            x, y, size
          );
          coinGrad.addColorStop(0, '#FFEB7F');
          coinGrad.addColorStop(0.7, '#FFD700');
          coinGrad.addColorStop(1, '#DAA520');

          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = coinGrad;
          ctx.fill();

          // Coin edge
          ctx.strokeStyle = '#B8860B';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Coin highlight
          ctx.beginPath();
          ctx.arc(x - size/3, y - size/3, size/3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.fill();

          // Add dollar sign
          ctx.font = `bold ${Math.floor(size * 0.8)}px Arial`;
          ctx.fillStyle = '#B8860B';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('$', x, y);
        }

        // Add shine/rays effect
        ctx.save();
        ctx.globalAlpha = 0.2;
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const gradient = ctx.createLinearGradient(
            canvas.width/2, canvas.height/2,
            canvas.width/2 + Math.cos(angle) * canvas.width,
            canvas.height/2 + Math.sin(angle) * canvas.height
          );

          gradient.addColorStop(0, 'white');
          gradient.addColorStop(1, 'transparent');

          ctx.fillStyle = gradient;

          // Draw a ray
          ctx.beginPath();
          ctx.moveTo(canvas.width/2, canvas.height/2);
          ctx.arc(
            canvas.width/2, canvas.height/2,
            canvas.width,
            angle - 0.1, angle + 0.1
          );
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // Draw reward text with shadow effect
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Add text shadow effect
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;

        // Draw "YOU WON!" text
        ctx.font = "bold 36px Arial";
        ctx.fillStyle = "#B8860B";
        ctx.fillText("YOU WON!", canvas.width / 2, 70);

        // Reset shadow for following text
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        // Draw reward amount with gold 3D effect
        ctx.font = "bold 60px Arial";
        const rewardAmount = "200";

        // Draw text with 3D effect
        for (let i = 5; i > 0; i--) {
          ctx.fillStyle = `rgba(184, 134, 11, ${0.2 + (i * 0.15)})`;
          ctx.fillText(rewardAmount, canvas.width/2, canvas.height/2 - (i * 1));
        }

        // Main text
        ctx.fillStyle = "#DAA520";
        ctx.fillText(rewardAmount, canvas.width/2, canvas.height/2);

        // Draw token symbol
        ctx.font = "bold 28px Arial";
        ctx.fillStyle = "#B8860B";
        ctx.fillText("JKPT", canvas.width / 2, canvas.height / 2 + 40);

        // Draw multiplier
        ctx.font = "bold 36px Arial";
        ctx.fillStyle = "#B8860B";
        ctx.fillText(`${rewardItem.multiplier}X`, canvas.width / 2, canvas.height - 70);

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Add a subtle glow effect around the center
        const glowGradient = ctx.createRadialGradient(
          canvas.width/2, canvas.height/2, 10,
          canvas.width/2, canvas.height/2, 120
        );
        glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
        glowGradient.addColorStop(1, 'transparent');

        ctx.fillStyle = glowGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

      } else {
        // Loss state - more subdued design
        // Draw a subtle gradient background
        const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        bgGradient.addColorStop(0, '#EEE');
        bgGradient.addColorStop(0.5, '#DDD');
        bgGradient.addColorStop(1, '#CCC');

        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Add a decorative border
        ctx.strokeStyle = '#AAA';
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

        // Draw a subtle pattern in the background
        ctx.fillStyle = 'rgba(170, 170, 170, 0.1)';
        for (let i = 0; i < 12; i++) {
          for (let j = 0; j < 12; j++) {
            if ((i + j) % 2 === 0) {
              ctx.fillRect(i * 25, j * 25, 25, 25);
            }
          }
        }

        // Add text shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        // Draw "NO WIN" text
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 48px Arial";
        ctx.fillStyle = "#777";
        ctx.fillText("NO WIN", canvas.width / 2, canvas.height / 2 - 20);

        // Draw "Try Again" text
        ctx.font = "bold 28px Arial";
        ctx.fillStyle = "#999";
        ctx.fillText("Try Again!", canvas.width / 2, canvas.height / 2 + 40);

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Draw a sad face icon
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2 - 90, 40, 0, Math.PI * 2);
        ctx.fillStyle = '#DDD';
        ctx.fill();
        ctx.strokeStyle = '#AAA';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Eyes
        ctx.fillStyle = '#999';
        ctx.beginPath();
        ctx.arc(canvas.width / 2 - 15, canvas.height / 2 - 95, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(canvas.width / 2 + 15, canvas.height / 2 - 95, 5, 0, Math.PI * 2);
        ctx.fill();

        // Sad mouth
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2 - 70, 20, Math.PI * 0.1, Math.PI * 0.9, false);
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Add "1 more attempt" text at the bottom
        ctx.font = "bold 20px Arial";
        ctx.fillStyle = "#777";
        ctx.fillText("1 more attempt left", canvas.width / 2, canvas.height - 60);
      }
    } catch (error) {
      console.error("Error drawing reward:", error);
    }
  };

  // Load attempts from localStorage based on wallet address
  useEffect(() => {
    if (typeof window !== 'undefined' && address) {
      const walletKey = `scratch-attempt-${address}`;
      const stored = localStorage.getItem(walletKey);
      const storedAttempt = stored ? parseInt(stored, 10) : 0;

      // If user has used both attempts, mark as exhausted
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

  return (
    <div className="min-h-screen w-full flex flex-col bg-red-950" style={{
      backgroundImage: 'url(https://brand-space.ams3.cdn.digitaloceanspaces.com/spin/lady/in_css_f5bf3e730d9927026d0a9e22c05afb35.static.jpg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    }}>
      {/* Header with wallet connection */}
      <header className="w-full p-4 flex justify-between items-center bg-gradient-to-r from-red-950 to-red-900 border-b border-yellow-600/30 sticky top-0 z-20">
        <div className="text-2xl font-bold flex items-center">
          <span className="text-3xl mr-2">💰</span>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-yellow-500">
            Golden Scratch & Win
          </span>
        </div>
        <ConnectButton />
      </header>

      <div className="relative z-10 flex flex-col items-center justify-center p-4 w-full max-w-4xl mx-auto mt-8">
        {/* Dashboard Layout */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column - Balance & Stats */}
          <div className="md:col-span-1">
            {/* Balance display */}
            <div className="bg-gradient-to-b from-red-900 to-red-950 rounded-xl p-6 w-full shadow-lg border border-yellow-600/30 backdrop-blur-sm">
              <h2 className="text-xl font-semibold mb-4 flex items-center text-yellow-300">
                <span className="mr-2">💰</span> Your Balance
              </h2>
              <div className="space-y-4">
                <div className="bg-red-900/50 p-4 rounded-lg backdrop-blur-sm border border-red-800">
                  <div className="text-yellow-200 text-sm">ETH</div>
                  <div className="font-bold text-xl text-white">
                    {isConnected ? "0.0000" : "Connect Wallet"}
                  </div>
                </div>
                <div className="bg-red-900/50 p-4 rounded-lg backdrop-blur-sm border border-red-800">
                  <div className="text-yellow-200 text-sm">JKPT</div>
                  <div className="font-bold text-xl text-white">
                    {isConnected ? "1000.0000" : "Connect Wallet"}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-yellow-200">
                Token: JACKPT Token
              </div>
            </div>

            {/* Coming Soon - Staking Module */}
            <div className="mt-6 bg-gradient-to-b from-red-900 to-red-950 rounded-xl p-6 w-full shadow-lg border border-yellow-600/30 backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-yellow-600 text-xs font-bold px-3 py-1 rounded-bl-lg text-white">
                COMING SOON
              </div>
              <h2 className="text-xl font-semibold mb-4 flex items-center text-yellow-300">
                <span className="mr-2">⚡</span> Token Staking
              </h2>
              <p className="text-sm text-yellow-200 mb-4">
                Stake your tokens to earn passive rewards and exclusive benefits!
              </p>
              <div className="bg-red-900/50 p-3 rounded-lg text-sm border border-red-800">
                <div className="flex justify-between mb-1">
                  <span className="text-yellow-200">APY:</span>
                  <span className="font-bold text-yellow-300">Up to 25%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-200">Launch:</span>
                  <span className="text-white">Q2 2025</span>
                </div>
              </div>
              <button className="w-full mt-4 py-2 bg-gradient-to-r from-yellow-600 to-yellow-700 rounded-lg text-white cursor-not-allowed border border-yellow-500 opacity-70">
                Staking Coming Soon
              </button>
            </div>

            {/* Rewards Table for Mobile */}
            <div className="md:hidden mt-6 bg-gradient-to-b from-red-900 to-red-950 rounded-xl p-6 w-full shadow-lg border border-yellow-600/30 backdrop-blur-sm">
              <h2 className="text-xl font-semibold mb-4 flex items-center text-yellow-300">
                <span className="mr-2">🏆</span> Rewards Table
              </h2>
              <div className="space-y-2">
                <div className="bg-red-900/50 p-3 rounded-lg text-sm border border-red-800 flex justify-between">
                  <span className="text-yellow-200">2x Tokens:</span>
                  <span className="font-bold text-yellow-300">100% on 2nd try</span>
                </div>
                <div className="bg-red-900/50 p-3 rounded-lg text-sm border border-red-800 flex justify-between">
                  <span className="text-yellow-200">No Win:</span>
                  <span className="font-bold text-yellow-300">100% on 1st try</span>
                </div>
                <div className="bg-red-900/50 p-3 rounded-lg text-sm border border-red-800 flex justify-between">
                  <span className="text-yellow-200">Attempts:</span>
                  <span className="font-bold text-yellow-300">2 per wallet</span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle and Right Columns - Game Section */}
          <div className="md:col-span-2">
            {/* Game section */}
            <div className="bg-gradient-to-b from-red-900/80 to-red-950/80 rounded-xl p-6 w-full shadow-lg border border-yellow-600/30 backdrop-blur-sm">
              <h2 className="text-xl font-semibold mb-4 flex items-center text-yellow-300 text-center justify-center">
                <span className="mr-2">🎮</span> Scratch & Win Game
              </h2>

              {/* Bet amount display */}
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-yellow-300">
                    Min: 1 - Max: 100 JKPT
                  </div>
                  <div className="text-sm text-yellow-300">
                    Win up to 2x your bet!
                  </div>
                </div>

                {/* Scratch notice */}
                <div className="mt-3 text-center text-sm text-yellow-200 bg-red-900/50 p-3 rounded-lg border border-red-800">
                  <p className="flex items-center justify-center font-bold">
                    <span className="mr-1">🎮</span>
                    SCRATCH CARD GAME
                  </p>
                  <p className="mt-1 text-xs">
                    {attemptsExhausted
                      ? "You've used both attempts for this wallet address."
                      : attempt === 0
                        ? "This is your first attempt. First scratch always loses!"
                        : "First attempt used. Second scratch always wins!"}
                  </p>
                </div>
              </div>

              {/* Main scratch area with mascot */}
              <div className="flex flex-row items-center justify-center gap-8 w-full max-w-3xl mx-auto mt-4">
                {/* Mascot image */}
                <div className="flex-none hidden md:block">
                  <img src="https://brand-space.ams3.cdn.digitaloceanspaces.com/spin/lady/images/v2.png" alt="Mascot" className="h-[300px] w-auto object-contain drop-shadow-2xl" />
                </div>

                {/* Scratch card area */}
                <div className="flex flex-col items-center">
                  {/* Card outer */}
                  <div className="relative w-[320px] rounded-[24px] border-4 border-yellow-400 bg-yellow-50 shadow-2xl flex flex-col items-center pb-6 overflow-hidden"
                    style={{
                      boxShadow: '0 8px 32px 0 rgba(255, 193, 7, 0.3)',
                      background: 'linear-gradient(135deg, #FFF6E0, #FFF2CC)'
                    }}>

                    {/* Gold header with stars and attempts */}
                    <div className="w-full mx-auto bg-gradient-to-r from-yellow-500 to-yellow-400 py-3 px-4 flex items-center justify-center" style={{ minHeight: '48px' }}>
                      <span className="text-yellow-900 text-xl mr-2">★</span>
                      <span className="text-white font-bold text-base tracking-wide">
                        {attemptsExhausted
                          ? "NO ATTEMPTS LEFT"
                          : `YOU HAVE ${2 - attempt} ATTEMPT${2 - attempt !== 1 ? 'S' : ''}`}
                      </span>
                      <span className="text-yellow-900 text-xl ml-2">★</span>
                    </div>

                    {/* Scratch card canvas container */}
                    <div className="relative w-[300px] h-[300px] overflow-hidden mt-2">
                      {/* This is the background/result layer */}
                      <canvas
                        ref={canvasRef}
                        className="absolute top-0 left-0 w-full h-full"
                      />
                      {/* This is the scratch layer */}
                      <canvas
                        ref={scratchRef}
                        className="absolute top-0 left-0 w-full h-full cursor-pointer"
                        style={{ touchAction: 'none' }}
                      />
                    </div>

                    {/* Play button */}
                    <button
                      onClick={handlePlay}
                      disabled={loading || attemptsExhausted || !isConnected || gamePaused}
                      className={`mt-1 py-3 px-8 rounded-full font-bold text-white shadow-lg transform transition-transform active:scale-95 ${
                        loading || attemptsExhausted || !isConnected || gamePaused
                          ? 'bg-gray-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 cursor-pointer'
                      }`}
                    >
                      {loading ? (
                        <span className="flex items-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </span>
                      ) : attemptsExhausted ? (
                        "No Attempts Left"
                      ) : !isConnected ? (
                        "Connect Wallet"
                      ) : gamePaused ? (
                        "Game Paused"
                      ) : isScratching ? (
                        "Scratch to Reveal"
                      ) : (
                        "Scratch Now"
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Rewards table - Desktop only */}
              <div className="hidden md:block w-full mt-6 overflow-hidden rounded-lg bg-red-900/50 border border-yellow-600/30">
                <div className="text-sm font-medium text-center text-yellow-300 py-2 border-b border-yellow-600/30 bg-red-950/50">
                  Possible Rewards
                </div>
                <div className="grid grid-cols-3 gap-1 p-2 text-sm">
                  <div className="bg-red-900/70 rounded p-2 text-center border border-red-800">
                    <div className="font-bold text-yellow-300">2x Tokens</div>
                    <div className="text-xs text-yellow-200">100% chance on 2nd try</div>
                  </div>
                  <div className="bg-red-900/70 rounded p-2 text-center border border-red-800">
                    <div className="font-bold text-yellow-300">No Win</div>
                    <div className="text-xs text-yellow-200">100% chance on 1st try</div>
                  </div>
                  <div className="bg-red-900/70 rounded p-2 text-center border border-red-800">
                    <div className="font-bold text-yellow-300">2 Attempts</div>
                    <div className="text-xs text-yellow-200">Per wallet address</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal for transaction status */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-gradient-to-b from-red-900 to-red-950 rounded-xl p-6 max-w-md w-full border border-yellow-600/30 shadow-2xl">
            <h3 className={`text-xl font-bold mb-4 ${
              modalType === 'success' ? 'text-yellow-300' :
              modalType === 'error' ? 'text-red-400' : 'text-blue-400'
            }`}>
              {modalTitle}
            </h3>
            <p className="text-white mb-6 whitespace-pre-line">{modalMessage}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 bg-gradient-to-r from-yellow-600 to-yellow-500 text-white rounded-lg hover:from-yellow-500 hover:to-yellow-400 transform transition-transform active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="w-full text-center text-yellow-500/80 text-sm py-4 mt-8 relative z-10 border-t border-yellow-900/30 bg-red-950/80">
        &copy; 2023-2025 JACKPT.COM - All rights reserved | Scratch & Win Game
      </footer>
    </div>
  );
}