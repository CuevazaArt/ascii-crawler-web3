// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Interfaces mínimas para la interacción con los tokens de héroes (ERC-721)
 * y equipamiento (ERC-1155) de forma segura.
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
 * @notice Contrato inteligente principal que gestiona el estado del juego, cobros, recompensas y permadeath.
 */
contract RoguelikeGame {
    
    // Direcciones de contratos del ecosistema
    IRougeToken public immutable rougeToken;
    IHeroNFT public immutable heroNFT;
    IEquipmentNFT public immutable equipmentNFT;
    
    // Configuración del juego
    uint256 public entryFee = 10 * 10**18;      // Tarifa de entrada: 10 $ROUGE
    uint256 public chestReward = 5 * 10**18;     // Recompensa de cofre: 5 $ROUGE
    uint256 public monsterReward = 2 * 10**18;   // Recompensa de monstruo: 2 $ROUGE
    
    struct GameState {
        uint256 heroTokenId;
        uint256 currentLevel;
        uint256 hp;
        uint256 score;
        bool isActive;
        bytes32 mapHash; // Hash de la semilla del mapa generado proceduralmente
    }
    
    // Mapeo de dirección del jugador a su estado de juego activo
    mapping(address => GameState) public playerSessions;
    
    // Historial de puntuaciones máximas
    mapping(address => uint256) public highScores;
    
    // Eventos
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
     * @notice Inicia una nueva partida (Run) cobrando la tarifa de entrada.
     * @param heroTokenId El ID del héroe NFT (ERC-721) que posee el jugador.
     * @param seed Semilla proporcionada por Chainlink VRF para la generación procedural.
     */
    function startRun(uint256 heroTokenId, uint256 seed) external {
        require(!playerSessions[msg.sender].isActive, "Ya tienes una partida activa");
        require(heroNFT.ownerOf(heroTokenId) == msg.sender, "No eres el propietario de este Heroe NFT");
        
        // Cobrar la tarifa de entrada en tokens $ROUGE
        require(rougeToken.transferFrom(msg.sender, address(this), entryFee), "Fallo el pago de la tarifa de entrada");
        
        // Inicializar el estado de la partida
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
     * @notice Registra el movimiento del jugador, validado de forma off-chain con ZK-Proofs.
     * @param newX Nueva coordenada X
     * @param newY Nueva coordenada Y
     * @param zkProof Representación de la prueba ZK que valida que el camino es legal y no atraviesa muros.
     */
    function move(int256 newX, int256 newY, bytes calldata zkProof) external {
        GameState storage session = playerSessions[msg.sender];
        require(session.isActive, "No tienes una partida activa");
        require(session.hp > 0, "El heroe esta muerto");
        
        // En una implementación real, se llamaría a un verificador criptográfico (verificador ZK-SNARK de Circom/Noir)
        // ej: require(zkVerifier.verify(zkProof, session.mapHash, newX, newY), "Prueba de movimiento invalida");
        bool isProofValid = verifyZKProofMock(zkProof);
        require(isProofValid, "Fallo en la prueba de conocimiento cero (ZK-Proof)");
        
        emit PlayerMoved(msg.sender, newX, newY, true);
    }
    
    /**
     * @notice Interactúa con un cofre en el mapa.
     * @param zkProof Prueba ZK que certifica que el jugador está en la coordenada exacta del cofre.
     */
    function openChest(bytes calldata zkProof) external {
        GameState storage session = playerSessions[msg.sender];
        require(session.isActive, "No tienes una partida activa");
        require(verifyZKProofMock(zkProof), "Fallo la prueba ZK de ubicacion de cofre");
        
        session.score += 50;
        
        // Recompensa directa en tokens
        require(rougeToken.transfer(msg.sender, chestReward), "Fallo transferencia de recompensa");
        
        // Emitir evento
        emit LootAcquired(msg.sender, "Cofre de Oro", chestReward);
    }
    
    /**
     * @notice Ejecuta el resultado de un combate con un monstruo.
     * @param zkProof Prueba ZK de la batalla.
     * @param monsterHpDamage Daño recibido por el jugador.
     * @param defeated Verdadero si el enemigo fue derrotado.
     */
    function resolveCombat(
        bytes calldata zkProof, 
        uint256 monsterHpDamage, 
        bool defeated
    ) external {
        GameState storage session = playerSessions[msg.sender];
        require(session.isActive, "No tienes una partida activa");
        require(verifyZKProofMock(zkProof), "Prueba de combate invalida");
        
        if (monsterHpDamage >= session.hp) {
            session.hp = 0;
            handlePlayerDeath(msg.sender);
        } else {
            session.hp -= monsterHpDamage;
            if (defeated) {
                session.score += 100;
                require(rougeToken.transfer(msg.sender, monsterReward), "Fallo transferencia por combate");
                emit MonsterDefeated(msg.sender, "Monstruo Comun");
            }
        }
    }
    
    /**
     * @notice Avanza de nivel en la mazmorra.
     * @param zkProof Prueba ZK que certifica que el jugador alcanzó las escaleras '>'.
     */
    function descendLevel(bytes calldata zkProof) external {
        GameState storage session = playerSessions[msg.sender];
        require(session.isActive, "No tienes una partida activa");
        require(verifyZKProofMock(zkProof), "Prueba de escaleras invalida");
        
        session.currentLevel += 1;
        session.score += 200;
        
        // Regenerar el hash del mapa para el siguiente nivel
        session.mapHash = keccak256(abi.encodePacked(session.mapHash, block.timestamp));
        
        emit LevelCompleted(msg.sender, session.currentLevel);
    }
    
    /**
     * @notice Retirarse voluntariamente para salvar el personaje y acuñar los tesoros.
     */
    function claimRunAndExit() external {
        GameState memory session = playerSessions[msg.sender];
        require(session.isActive, "No tienes una partida activa");
        
        // Otorgar botín en NFT por completar la partida (ej: un cofre o pieza de equipamiento raro)
        if (session.currentLevel > 1) {
            equipmentNFT.mint(msg.sender, 1, 1, ""); // ID 1: Espada de Aventurero
        }
        
        if (session.score > highScores[msg.sender]) {
            highScores[msg.sender] = session.score;
        }
        
        delete playerSessions[msg.sender];
        
        emit GameOver(msg.sender, session.score, false);
    }
    
    /**
     * @dev Maneja la muerte del héroe y aplica Permadeath.
     */
    function handlePlayerDeath(address player) internal {
        GameState memory session = playerSessions[player];
        
        // Aplicar permadeath: Quemar el Heroe NFT del jugador
        heroNFT.burn(session.heroTokenId);
        
        if (session.score > highScores[player]) {
            highScores[player] = session.score;
        }
        
        delete playerSessions[player];
        
        emit GameOver(player, session.score, true);
    }
    
    /**
     * @dev Validador Mock de pruebas ZK.
     */
    function verifyZKProofMock(bytes calldata proof) internal pure returns (bool) {
        return proof.length > 0;
    }
}
