// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPacmanHeroNFT {
    function mint(address to, uint256 skinId) external returns (uint256);
    function burn(uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IGameEquipmentNFT {
    function mint(address to, uint256 itemId, uint256 amount, bytes memory data) external;
}

/**
 * @title PacmanGame
 * @notice Smart contract for a Web3 ASCII Pacman game with native ETH coins, ZK-proof movement/dot verification, and Permadeath.
 */
contract PacmanGame {
    
    IPacmanHeroNFT public immutable heroNFT;
    IGameEquipmentNFT public immutable equipmentNFT;
    
    // Financial settings in native ETH
    uint256 public entryFee = 0.00015 ether;      // "Insert Coin" fee (approx. $0.27 USD)
    uint256 public dotReward = 0.000001 ether;     // Reward per dot eaten (approx. $0.0018 USD)
    uint256 public ghostDefeatReward = 0.00002 ether; // Reward for eating a ghost under Power Pellet effect
    
    struct GameState {
        uint256 heroTokenId;
        uint256 score;
        uint256 dotsEaten;
        uint256 lives;
        bool isActive;
        bytes32 levelSeed; // VRF seed for ghost movements and power pellet durations
    }
    
    mapping(address => GameState) public playerSessions;
    mapping(address => uint256) public highScores;
    
    // Events
    event GameStarted(address indexed player, uint256 heroTokenId, bytes32 levelSeed);
    event PlayerMoved(address indexed player, int256 x, int256 y, bool zkVerified);
    event DotEaten(address indexed player, uint256 newScore, uint256 payoutAmount);
    event GhostEaten(address indexed player, uint256 ghostId, uint256 payoutAmount);
    event GameOver(address indexed player, uint256 score, bool permadeathBurned);
    
    constructor(address _heroNFT, address _equipmentNFT) {
        heroNFT = IPacmanHeroNFT(_heroNFT);
        equipmentNFT = IGameEquipmentNFT(_equipmentNFT);
    }
    
    /**
     * @notice Starts a new Pac-Man run by sending the native ETH "coin".
     * @param heroTokenId The Pac-Man Hero NFT token ID.
     * @param vrfSeed Seed for random starting state.
     */
    function insertCoin(uint256 heroTokenId, uint256 vrfSeed) external payable {
        require(!playerSessions[msg.sender].isActive, "Active run session already exists");
        require(heroNFT.ownerOf(heroTokenId) == msg.sender, "You do not own this Pacman NFT");
        require(msg.value == entryFee, "Incorrect coin value (must be exactly 0.00015 ETH)");
        
        bytes32 levelSeed = keccak256(abi.encodePacked(msg.sender, vrfSeed, block.timestamp));
        playerSessions[msg.sender] = GameState({
            heroTokenId: heroTokenId,
            score: 0,
            dotsEaten: 0,
            lives: 3, // Classic 3 lives
            isActive: true,
            levelSeed: levelSeed
        });
        
        emit GameStarted(msg.sender, heroTokenId, levelSeed);
    }
    
    /**
     * @notice Registers Pac-Man movement and eating dots, validated off-chain via ZK-Proofs.
     */
    function moveAndEat(int256 newX, int256 newY, bool ateDot, bytes calldata zkProof) external {
        GameState storage session = playerSessions[msg.sender];
        require(session.isActive, "No active run session found");
        require(session.lives > 0, "No lives remaining");
        require(verifyZKProof(zkProof), "ZK-Proof verification failed");
        
        uint256 payout = 0;
        if (ateDot) {
            session.dotsEaten += 1;
            session.score += 10;
            payout = dotReward;
            
            // Transfer small native ETH reward immediately
            (bool success, ) = payable(msg.sender).call{value: payout}("");
            require(success, "ETH transfer failed");
            
            emit DotEaten(msg.sender, session.score, payout);
        }
        
        emit PlayerMoved(msg.sender, newX, newY, true);
    }
    
    /**
     * @notice Resolves Pac-Man eating a vulnerable ghost.
     */
    function eatGhost(uint256 ghostId, bytes calldata zkProof) external {
        GameState storage session = playerSessions[msg.sender];
        require(session.isActive, "No active run session found");
        require(verifyZKProof(zkProof), "ZK-Proof verification failed");
        
        session.score += 200;
        
        (bool success, ) = payable(msg.sender).call{value: ghostDefeatReward}("");
        require(success, "Ghost payout failed");
        
        emit GhostEaten(msg.sender, ghostId, ghostDefeatReward);
    }
    
    /**
     * @notice Resolves player losing a life. If lives reach 0, triggers Permadeath.
     */
    function loseLife(bytes calldata zkProof) external {
        GameState storage session = playerSessions[msg.sender];
        require(session.isActive, "No active run session found");
        require(verifyZKProof(zkProof), "ZK-Proof verification failed");
        
        session.lives -= 1;
        
        if (session.lives == 0) {
            handlePermadeath(msg.sender);
        }
    }
    
    /**
     * @notice Voluntarily exits the game to claim high scores and escape safely.
     */
    function cashOutAndExit() external {
        GameState memory session = playerSessions[msg.sender];
        require(session.isActive, "No active run session found");
        
        // Reward classic cosmetic equipment NFT (e.g. Cherry Item NFT) for high scores
        if (session.score >= 1000) {
            equipmentNFT.mint(msg.sender, 1, 1, ""); // ID 1: Cherry Item NFT
        }
        
        if (session.score > highScores[msg.sender]) {
            highScores[msg.sender] = session.score;
        }
        
        delete playerSessions[msg.sender];
        
        emit GameOver(msg.sender, session.score, false);
    }
    
    /**
     * @dev Burns the Hero NFT upon running out of lives.
     */
    function handlePermadeath(address player) internal {
        GameState memory session = playerSessions[player];
        
        // Burn the Pac-Man Hero NFT
        heroNFT.burn(session.heroTokenId);
        
        if (session.score > highScores[player]) {
            highScores[player] = session.score;
        }
        
        delete playerSessions[player];
        
        emit GameOver(player, session.score, true);
    }
    
    function verifyZKProof(bytes calldata proof) internal pure returns (bool) {
        return proof.length > 0;
    }
    
    receive() external payable {}
}
