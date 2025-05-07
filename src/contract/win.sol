// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
 * @title InstantScratchAndWin
 * @dev A contract that allows users to bet exactly 100 JACKPT.COM tokens
 * The second time a user plays, they automatically win 150 tokens and get a casino bonus URL
 */
contract InstantScratchAndWin is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    
    // Game parameters
    IERC20 public gameToken;
    uint256 public constant BET_AMOUNT = 100; // Fixed bet of 100 JACKPT.COM tokens
    uint256 public constant SECOND_PLAY_WIN_AMOUNT = 150; // Fixed win amount for second play
    string public casinoBonusUrl = "https://jackpt.com"; // URL to redirect users
    
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
    
    // Player stats
    mapping(address => uint256) public playerBetCount;
    mapping(address => bool) public hasReceivedBonus;
    
    // For pseudo-randomness improvement
    uint256 private nonce = 0;
    
    // Emergency controls
    bool public gamePaused;
    
    // Events
    event BetPlaced(address indexed player, uint256 amount, bool won, uint256 reward);
    event CasinoBonusAwarded(address indexed player, string bonusUrl);
    event PrizeTiersUpdated();
    event GameTokenUpdated(address newToken);
    event GamePaused(bool isPaused);
    event EmergencyWithdrawal(address token, uint256 amount);
    event BonusUrlUpdated(string newUrl);
    
    /**
     * @dev Constructor
     * @param _token The ERC20 token used for betting (JACKPT.COM)
     */
    constructor(
        address _token
    ) Ownable(msg.sender) {
        gameToken = IERC20(_token);
        gamePaused = false;
        
        // Initialize prize tiers with default values (for first play)
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
        ))) % 10000;
    }
    
    /**
     * @dev Place a bet of exactly 100 JACKPT.COM tokens and immediately get results
     * @return won Whether the player won
     * @return reward The reward amount (0 if lost)
     * @return bonusAwarded Whether a casino bonus was awarded
     * @return bonusUrl URL to claim casino bonus (if awarded)
     */
    function placeBet() external nonReentrant returns (bool won, uint256 reward, bool bonusAwarded, string memory bonusUrl) {
        require(!gamePaused, "Game is paused");
        
        // Transfer exactly 100 tokens from player to contract
        require(gameToken.transferFrom(msg.sender, address(this), BET_AMOUNT), "Token transfer failed");
        
        // Update stats
        totalBets++;
        totalWagered = totalWagered.add(BET_AMOUNT);
        
        // Increment player bet count
        playerBetCount[msg.sender] = playerBetCount[msg.sender].add(1);
        
        // Check if this is the player's second bet
        if (playerBetCount[msg.sender] == 2 && !hasReceivedBonus[msg.sender]) {
            // Automatically win 150 tokens on second play
            reward = SECOND_PLAY_WIN_AMOUNT;
            won = true;
            bonusAwarded = true;
            bonusUrl = casinoBonusUrl;
            
            // Mark bonus as received
            hasReceivedBonus[msg.sender] = true;
            
            // Emit bonus awarded event
            emit CasinoBonusAwarded(msg.sender, casinoBonusUrl);
        } else {
            // For first play and subsequent plays (after second), use normal random mechanism
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
            reward = BET_AMOUNT.mul(multiplier).div(10000);
            won = (reward > 0);
            bonusAwarded = false;
            bonusUrl = "";
        }
        
        // Transfer winnings to player if they won
        if (won) {
            require(gameToken.transfer(msg.sender, reward), "Reward transfer failed");
            totalRewarded = totalRewarded.add(reward);
        }
        
        // Emit bet placed event
        emit BetPlaced(msg.sender, BET_AMOUNT, won, reward);
        
        return (won, reward, bonusAwarded, bonusUrl);
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
            require(totalProbability <= 10000, "Total probability exceeds 100%");
            
            prizeTiers.push(PrizeTier({
                multiplier: _multipliers[i],
                probability: _probabilities[i]
            }));
        }
        
        emit PrizeTiersUpdated();
    }
    
    /**
     * @dev Update the casino bonus URL (owner only)
     * @param _newUrl The new casino bonus URL
     */
    function updateBonusUrl(string calldata _newUrl) external onlyOwner {
        casinoBonusUrl = _newUrl;
        emit BonusUrlUpdated(_newUrl);
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
     * @dev Reset a player's bet count and bonus status (owner only)
     * @param _player The player's address
     */
    function resetPlayerStatus(address _player) external onlyOwner {
        playerBetCount[_player] = 0;
        hasReceivedBonus[_player] = false;
    }
    
    /**
     * @dev Get contract balance of the game token
     * @return balance The token balance
     */
    function getContractBalance() external view returns (uint256 balance) {
        return gameToken.balanceOf(address(this));
    }
    
    /**
     * @dev Get a player's bet count
     * @param _player The player's address
     * @return count The number of bets placed by the player
     */
    function getPlayerBetCount(address _player) external view returns (uint256 count) {
        return playerBetCount[_player];
    }
    
    /**
     * @dev Check if a player has received the bonus
     * @param _player The player's address
     * @return received Whether the player has received the bonus
     */
    function hasPlayerReceivedBonus(address _player) external view returns (bool received) {
        return hasReceivedBonus[_player];
    }
    
    /**
     * @dev Accept ETH deposits
     */
    receive() external payable {}
}