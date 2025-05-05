// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
 * @title InstantScratchAndWin
 * @dev A contract that allows users to bet tokens and win rewards through a scratch-and-win game
 * Uses blockchain-derived pseudo-randomness for instant results
 * NOTE: This approach is less secure than Chainlink VRF but provides instant results
 */
contract InstantScratchAndWin is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    
    // Game parameters
    IERC20 public gameToken;
    uint256 public minBet;
    uint256 public maxBet;
    uint256 public houseEdge; // In basis points (e.g., 500 = 5%)
    uint256 public constant BASIS_POINTS = 10000;
    
    // Prize tiers in multipliers x10000 (e.g., 50000 = 5x)
    struct PrizeTier {
        uint256 multiplier; // x10000 for precision
        uint256 probability; // In basis points (e.g., 500 = 5%)
    }
    
    // Define the prize tiers and their probability
    PrizeTier[] public prizeTiers;
    
    // Game stats
    uint256 public totalBets;
    uint256 public totalWagered;
    uint256 public totalRewarded;
    
    // For pseudo-randomness improvement
    uint256 private nonce = 0;
    
    // Emergency controls
    bool public gamePaused;
    
    // Events
    event BetPlaced(address indexed player, uint256 amount, bool won, uint256 reward, uint256 multiplier);
    event PrizeTiersUpdated();
    event GameParametersUpdated(uint256 minBet, uint256 maxBet, uint256 houseEdge);
    event GameTokenUpdated(address newToken);
    event GamePaused(bool isPaused);
    event EmergencyWithdrawal(address token, uint256 amount);
    
    /**
     * @dev Constructor
     * @param _token The ERC20 token used for betting
     * @param _minBet The minimum betting amount
     * @param _maxBet The maximum betting amount
     * @param _houseEdge The house edge in basis points
     */
    constructor(
        address _token,
        uint256 _minBet,
        uint256 _maxBet,
        uint256 _houseEdge
    ) Ownable(msg.sender) {
        gameToken = IERC20(_token);
        minBet = _minBet;
        maxBet = _maxBet;
        houseEdge = _houseEdge;
        gamePaused = false;
        
        // Initialize prize tiers with default values
        // 5x multiplier with 2% chance
        prizeTiers.push(PrizeTier({multiplier: 50000, probability: 200}));
        
        // 3x multiplier with 5% chance
        prizeTiers.push(PrizeTier({multiplier: 30000, probability: 500}));
        
        // 2x multiplier with 10% chance
        prizeTiers.push(PrizeTier({multiplier: 20000, probability: 1000}));
        
        // 1.5x multiplier with 15% chance
        prizeTiers.push(PrizeTier({multiplier: 15000, probability: 1500}));
        
        // 1.2x multiplier with 18% chance
        prizeTiers.push(PrizeTier({multiplier: 12000, probability: 1800}));
        
        // 0x multiplier (loss) with 50% chance - the rest of the probability
        // We don't need to explicitly define this tier as it's the default outcome
    }
    
    /**
     * @dev Generate a pseudo-random number
     * NOTE: This is not cryptographically secure but provides instant results
     * @return A pseudo-random number
     */
    function generatePseudoRandomNumber() private returns (uint256) {
        nonce++;
        return uint256(keccak256(abi.encodePacked(
            blockhash(block.number - 1),
            block.timestamp,
            msg.sender,
            nonce
        ))) % BASIS_POINTS;
    }
    
    /**
     * @dev Place a bet and immediately get results
     * @param _amount The amount of tokens to bet
     * @return won Whether the player won
     * @return reward The reward amount (0 if lost)
     */
    function placeBet(uint256 _amount) external nonReentrant returns (bool won, uint256 reward) {
        require(!gamePaused, "Game is paused");
        require(_amount >= minBet, "Bet amount below minimum");
        require(_amount <= maxBet, "Bet amount above maximum");
        
        // Transfer tokens from player to contract
        require(gameToken.transferFrom(msg.sender, address(this), _amount), "Token transfer failed");
        
        // Generate pseudo-random number and determine result
        uint256 randomResult = generatePseudoRandomNumber();
        uint256 cumulativeProbability = 0;
        uint256 multiplier = 0; // Default to 0 (loss)
        
        // Check each prize tier to see if the player won
        for (uint256 i = 0; i < prizeTiers.length; i++) {
            cumulativeProbability = cumulativeProbability.add(prizeTiers[i].probability);
            
            if (randomResult < cumulativeProbability) {
                multiplier = prizeTiers[i].multiplier;
                break;
            }
        }
        
        // Calculate reward (if any)
        reward = _amount.mul(multiplier).div(10000);
        won = (reward > 0);
        
        // Update stats
        totalBets++;
        totalWagered = totalWagered.add(_amount);
        
        // Transfer winnings to player if they won
        if (won) {
            require(gameToken.transfer(msg.sender, reward), "Reward transfer failed");
            totalRewarded = totalRewarded.add(reward);
        }
        
        // Emit event
        emit BetPlaced(msg.sender, _amount, won, reward, multiplier);
        
        return (won, reward);
    }
    
    /**
     * @dev Get all prize tiers
     * @return multipliers Array of prize multipliers
     * @return probabilities Array of prize probabilities
     */
    function getPrizeTiers() external view returns (uint256[] memory multipliers, uint256[] memory probabilities) {
        multipliers = new uint256[](prizeTiers.length);
        probabilities = new uint256[](prizeTiers.length);
        
        for (uint256 i = 0; i < prizeTiers.length; i++) {
            multipliers[i] = prizeTiers[i].multiplier;
            probabilities[i] = prizeTiers[i].probability;
        }
        
        return (multipliers, probabilities);
    }
    
    /**
     * @dev Update the prize tiers (owner only)
     * @param _multipliers Array of prize multipliers (x10000)
     * @param _probabilities Array of prize probabilities (in basis points)
     */
    function updatePrizeTiers(
        uint256[] calldata _multipliers,
        uint256[] calldata _probabilities
    ) external onlyOwner {
        require(_multipliers.length == _probabilities.length, "Arrays must have same length");
        
        // Clear existing prize tiers
        delete prizeTiers;
        
        // Validate the total probability doesn't exceed 100%
        uint256 totalProbability = 0;
        
        for (uint256 i = 0; i < _multipliers.length; i++) {
            totalProbability = totalProbability.add(_probabilities[i]);
            require(totalProbability <= BASIS_POINTS, "Total probability exceeds 100%");
            
            prizeTiers.push(PrizeTier({
                multiplier: _multipliers[i],
                probability: _probabilities[i]
            }));
        }
        
        emit PrizeTiersUpdated();
    }
    
    /**
     * @dev Update the game parameters (owner only)
     * @param _minBet The new minimum bet
     * @param _maxBet The new maximum bet
     * @param _houseEdge The new house edge in basis points
     */
    function updateGameParameters(
        uint256 _minBet,
        uint256 _maxBet,
        uint256 _houseEdge
    ) external onlyOwner {
        require(_minBet <= _maxBet, "Min bet must be <= max bet");
        require(_houseEdge <= 2000, "House edge too high"); // Max 20%
        
        minBet = _minBet;
        maxBet = _maxBet;
        houseEdge = _houseEdge;
        
        emit GameParametersUpdated(_minBet, _maxBet, _houseEdge);
    }
    
    /**
     * @dev Update the game token (owner only)
     * @param _newToken The new token address
     */
    function updateGameToken(address _newToken) external onlyOwner {
        require(_newToken != address(0), "Invalid token address");
        gameToken = IERC20(_newToken);
        
        emit GameTokenUpdated(_newToken);
    }
    
    /**
     * @dev Pause or unpause the game (owner only)
     * @param _paused Whether the game should be paused
     */
    function setGamePaused(bool _paused) external onlyOwner {
        gamePaused = _paused;
        
        emit GamePaused(_paused);
    }
    
    /**
     * @dev Calculate the expected house profit based on prize tiers and house edge
     * @return expectedProfit The expected profit in basis points (e.g., 200 = 2%)
     */
    function calculateExpectedProfit() external view returns (int256 expectedProfit) {
        int256 expectedPayout = 0;
        uint256 totalProbability = 0;
        
        // Calculate expected payout from prize tiers
        for (uint256 i = 0; i < prizeTiers.length; i++) {
            expectedPayout += int256(prizeTiers[i].multiplier * prizeTiers[i].probability) / int256(BASIS_POINTS);
            totalProbability += prizeTiers[i].probability;
        }
        
        // Account for the loss probability (remaining probability)
        totalProbability = BASIS_POINTS - totalProbability;
        
        // Calculate expected profit/loss (positive = profit, negative = loss)
        expectedProfit = int256(BASIS_POINTS) - expectedPayout;
        
        return expectedProfit;
    }
    
    /**
     * @dev Withdraw tokens from the contract in case of emergency (owner only)
     * @param _token The token address (use address(0) for ETH)
     * @param _amount The amount to withdraw
     */
    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        if (_token == address(0)) {
            // Withdraw ETH
            (bool success, ) = payable(owner()).call{value: _amount}("");
            require(success, "ETH withdrawal failed");
        } else {
            // Withdraw tokens
            IERC20 token = IERC20(_token);
            require(token.transfer(owner(), _amount), "Token withdrawal failed");
        }
        
        emit EmergencyWithdrawal(_token, _amount);
    }
    
    /**
     * @dev Get contract balance of the game token
     * @return balance The token balance
     */
    function getContractBalance() external view returns (uint256 balance) {
        return gameToken.balanceOf(address(this));
    }
    
    /**
     * @dev Accept ETH deposits
     */
    receive() external payable {}
}