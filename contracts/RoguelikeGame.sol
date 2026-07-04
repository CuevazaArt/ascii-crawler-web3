// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Minimum interfaces for interacting with Hero NFTs (ERC-721)
 * and Equipment NFTs (ERC-1155) securely.
 */
interface IHeroNFT {
    function mint(address to, uint256 classId) external returns (uint256);
    function burn(uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IEquipmentNFT {
    function mint(address to, uint256 itemId, uint256 amount, bytes memory data) external;
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes memory data) external;
}

interface IRougeToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @title RoguelikeGame
 * @notice Main smart contract managing game state, entry fees, rewards, and permadeath.
 */
contract RoguelikeGame {
    
    // Ecosystem contract addresses
    IRougeToken public immutable rougeToken;
    IHeroNFT public immutable heroNFT;
    IEquipmentNFT public immutable equipmentNFT;
    
    // Game configurations
    uint256 public entryFee = 10 * 10**18;      // Entry fee: 10 $ROUGE
    uint256 public chestReward = 5 * 10**18;     // Chest reward: 5 $ROUGE
    uint256 public monsterReward = 2 * 10**18;   // Monster defeat reward: 2 $ROUGE
    
    struct GameState {
        uint256 heroTokenId;
        uint256 currentLevel;
        uint256 hp;
        uint256 score;
        bool isActive;
        bytes32 mapHash; // Hash of the procedurally generated map seed
    }
    
    // Mapping from player address to active game state
    mapping(address => GameState) public playerSessions;
    
    // High score leaderboards
    mapping(address => uint256) public highScores;
    
    // Events
    event RunStarted(address indexed player, uint256 heroTokenId, bytes32 mapHash);
    event PlayerMoved(address indexed player, int256 newX, int256 newY, bool pathVerifiedByZK);
    event LootAcquired(address indexed player, string lootType, uint256 tokenReward);
    event MonsterDefeated(address indexed player, string enemyType);
    event GameOver(address indexed player, uint256 score, bool permadeathBurned);
    event LevelCompleted(address indexed player, uint256 nextLevel);

    constructor(
        address _rougeToken,
        address _heroNFT,
        address _equipmentNFT
    ) {
        rougeToken = IRougeToken(_rougeToken);
        heroNFT = IHeroNFT(_heroNFT);
        equipmentNFT = IEquipmentNFT(_equipmentNFT);
    }
    
    /**
     * @notice Starts a new game session (Run) by charging the entry fee.
     * @param heroTokenId The ERC-721 token ID of the player's hero.
     * @param seed Random seed from Chainlink VRF for procedural level generation.
     */
    function startRun(uint256 heroTokenId, uint256 seed) external {
        require(!playerSessions[msg.sender].isActive, "You already have an active game run");
        require(heroNFT.ownerOf(heroTokenId) == msg.sender, "You are not the owner of this Hero NFT");
        
        // Charge entry fee in $ROUGE tokens
        require(rougeToken.transferFrom(msg.sender, address(this), entryFee), "Entry fee payment failed");
        
        // Initialize game session state
        bytes32 mapHash = keccak256(abi.encodePacked(msg.sender, seed, block.timestamp));
        playerSessions[msg.sender] = GameState({
            heroTokenId: heroTokenId,
            currentLevel: 1,
            hp: 100,
            score: 0,
            isActive: true,
            mapHash: mapHash
        });
        
        emit RunStarted(msg.sender, heroTokenId, mapHash);
    }
    
    /**
     * @notice Registers player movement, validated off-chain via ZK-Proofs.
     * @param newX Target X coordinate
     * @param newY Target Y coordinate
     * @param zkProof ZK proof validating the path is legal and does not cross walls.
     */
    function move(int256 newX, int256 newY, bytes calldata zkProof) external {
        GameState storage session = playerSessions[msg.sender];
        require(session.isActive, "No active run session found");
        require(session.hp > 0, "Hero is dead");
        
        // Real implementation would call a cryptographic verifier (e.g. zk-SNARK verifier contract)
        // e.g. require(zkVerifier.verify(zkProof, session.mapHash, newX, newY), "Invalid path proof");
        bool isProofValid = verifyZKProofMock(zkProof);
        require(isProofValid, "ZK-Proof verification failed");
        
        emit PlayerMoved(msg.sender, newX, newY, true);
    }
    
    /**
     * @notice Interacts with a chest on the map.
     * @param zkProof ZK proof proving the player is standing on the exact chest coordinate.
     */
    function openChest(bytes calldata zkProof) external {
        GameState storage session = playerSessions[msg.sender];
        require(session.isActive, "No active run session found");
        require(verifyZKProofMock(zkProof), "ZK-Proof verification for chest location failed");
        
        session.score += 50;
        
        // Transfer direct token reward
        require(rougeToken.transfer(msg.sender, chestReward), "Loot transfer failed");
        
        emit LootAcquired(msg.sender, "Golden Chest", chestReward);
    }
    
    /**
     * @notice Resolves the outcome of a monster combat turn.
     * @param zkProof ZK proof of combat calculations.
     * @param monsterHpDamage Damage dealt to the player.
     * @param defeated True if the monster was killed.
     */
    function resolveCombat(
        bytes calldata zkProof, 
        uint256 monsterHpDamage, 
        bool defeated
    ) external {
        GameState storage session = playerSessions[msg.sender];
        require(session.isActive, "No active run session found");
        require(verifyZKProofMock(zkProof), "ZK-Proof verification for combat failed");
        
        if (monsterHpDamage >= session.hp) {
            session.hp = 0;
            handlePlayerDeath(msg.sender);
        } else {
            session.hp -= monsterHpDamage;
            if (defeated) {
                session.score += 100;
                require(rougeToken.transfer(msg.sender, monsterReward), "Combat reward transfer failed");
                emit MonsterDefeated(msg.sender, "Common Monster");
            }
        }
    }
    
    /**
     * @notice Descends to the next level of the dungeon.
     * @param zkProof ZK proof proving the player reached the stairs symbol '>'.
     */
    function descendLevel(bytes calldata zkProof) external {
        GameState storage session = playerSessions[msg.sender];
        require(session.isActive, "No active run session found");
        require(verifyZKProofMock(zkProof), "ZK-Proof verification for stairs failed");
        
        session.currentLevel += 1;
        session.score += 200;
        
        // Regenerate map seed hash for next floor
        session.mapHash = keccak256(abi.encodePacked(session.mapHash, block.timestamp));
        
        emit LevelCompleted(msg.sender, session.currentLevel);
    }
    
    /**
     * @notice Voluntarily exits the dungeon to save the hero and claim item NFTs.
     */
    function claimRunAndExit() external {
        GameState memory session = playerSessions[msg.sender];
        require(session.isActive, "No active run session found");
        
        // Mint reward NFT if player progressed past Level 1
        if (session.currentLevel > 1) {
            equipmentNFT.mint(msg.sender, 1, 1, ""); // ID 1: Adventurer's Sword
        }
        
        if (session.score > highScores[msg.sender]) {
            highScores[msg.sender] = session.score;
        }
        
        delete playerSessions[msg.sender];
        
        emit GameOver(msg.sender, session.score, false);
    }
    
    /**
     * @dev Handles player death and applies permadeath mechanics.
     */
    function handlePlayerDeath(address player) internal {
        GameState memory session = playerSessions[player];
        
        // Burn the Hero NFT
        heroNFT.burn(session.heroTokenId);
        
        if (session.score > highScores[player]) {
            highScores[player] = session.score;
        }
        
        delete playerSessions[player];
        
        emit GameOver(player, session.score, true);
    }
    
    /**
     * @dev Mock ZK proof verifier.
     */
    function verifyZKProofMock(bytes calldata proof) internal pure returns (bool) {
        return proof.length > 0;
    }
}
