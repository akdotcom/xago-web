document.addEventListener('DOMContentLoaded', () => {
    const BOARD_SIZE = 15; // Example size, can be adjusted
    const NUM_TILES_PER_PLAYER = 14;

    const gameBoard = document.getElementById('game-board');
    const player1HandDisplay = document.querySelector('#player1-hand .tiles-container');
    const player2HandDisplay = document.querySelector('#player2-hand .tiles-container');
    const currentPlayerDisplay = document.getElementById('current-player');
    const gameMessageDisplay = document.getElementById('game-message');
    const player1ScoreDisplay = document.getElementById('player1-score');
    const player2ScoreDisplay = document.getElementById('player2-score');
    const resetGameButton = document.getElementById('reset-game');

    let boardState = {}; // Using an object to store tile placements: 'x,y': tileObject
    let player1Hand = [];
    let player2Hand = [];
    let currentPlayer = 1; // Player 1 starts
    let player1Score = 0;
    let player2Score = 0;
    let selectedTile = null; // { tile: tileObject, handElement: tileElement }
    let gameInitialized = false;

    // --- Tile Representation ---
    // Edge types: 0 for blank, 1 for triangle
    // Edges are ordered clockwise starting from the top edge.
    class HexTile {
        constructor(id, playerId, edges = [0, 0, 0, 0, 0, 0]) {
            this.id = id; // Unique ID for the tile
            this.playerId = playerId; // 1 or 2
            this.edges = edges; // Array of 6 values (0 or 1)
            this.orientation = 0; // 0-5, representing rotation
            this.x = null; // Board x position
            this.y = null; // Board y position
        }

        // Method to get edges considering current orientation (if rotation is implemented)
        getOrientedEdges() {
            const rotatedEdges = [...this.edges];
            for (let i = 0; i < this.orientation; i++) {
                rotatedEdges.unshift(rotatedEdges.pop());
            }
            return rotatedEdges;
        }

        // Basic representation for now
        get color() {
            return this.playerId === 1 ? 'lightblue' : 'lightcoral';
        }
    }

    // --- Tile Generation ---
    function generateUniqueTilesForPlayer(playerId, count) {
        const tiles = [];
        const usedPatterns = new Set();

        // Example patterns - this needs to be more robust to ensure 14 unique tiles
        // And ensure that edges make sense for gameplay (not all blanks, not all triangles)
        // For now, a simple random generation with a check for uniqueness
        for (let i = 0; i < count; i++) {
            let tilePattern;
            let patternString;
            do {
                tilePattern = Array(6).fill(0).map(() => Math.round(Math.random()));
                // Ensure not all edges are the same (e.g., all blank or all triangle)
                const sum = tilePattern.reduce((a, b) => a + b, 0);
                if (sum === 0 || sum === 6) { // All blanks or all triangles
                    patternString = null; // Force retry
                    continue;
                }
                patternString = tilePattern.join('');
            } while (usedPatterns.has(patternString));

            usedPatterns.add(patternString);
            tiles.push(new HexTile(`p${playerId}t${i}`, playerId, tilePattern));
        }
        return tiles;
    }

    // --- Game Board Logic ---
    function initializeGameBoard() {
        gameBoard.innerHTML = ''; // Clear previous board
        boardState = {}; // Reset board state

        // For a true hex grid, rendering is more complex.
        // Using a simple grid for now, where cells can be targeted.
        // This part will need significant enhancement for hex grid interaction.
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cell = document.createElement('div');
                cell.classList.add('board-cell');
                cell.dataset.x = c;
                cell.dataset.y = r;
                cell.addEventListener('click', () => handleCellClick(c, r));
                // Add hover effects for potential drop zones
                cell.addEventListener('dragover', (event) => {
                    event.preventDefault(); // Allow drop
                    if (selectedTile && isPlacementValid(selectedTile.tile, c, r, true)) {
                        cell.classList.add('drop-target');
                    }
                });
                cell.addEventListener('dragleave', () => {
                    cell.classList.remove('drop-target');
                });
                cell.addEventListener('drop', (event) => {
                    event.preventDefault();
                    cell.classList.remove('drop-target');
                    handleCellClick(c,r); // Use the same logic as click for now
                });
                gameBoard.appendChild(cell);
            }
        }
        console.log("Game board initialized with clickable cells.");
    }

    function getBoardCell(x, y) {
        return gameBoard.querySelector(`.board-cell[data-x="${x}"][data-y="${y}"]`);
    }

    // --- Display Logic ---
    function displayPlayerHand(player, hand, handDisplayElement) {
        handDisplayElement.innerHTML = '';
        hand.forEach(tile => {
            const tileElement = createTileElement(tile);
            tileElement.addEventListener('click', () => selectTileFromHand(tile, tileElement, player));
            handDisplayElement.appendChild(tileElement);
        });
    }

    function createTileElement(tile, isBoardTile = false) {
        const tileElement = document.createElement('div');
        tileElement.classList.add('hexagon-tile');
        tileElement.classList.add(tile.playerId === 1 ? 'player1' : 'player2');
        tileElement.dataset.tileId = tile.id;
        tileElement.style.backgroundColor = tile.color; // Redundant with class but fine

        // Basic text representation of edges for now
        // Top, TR, BR, Bottom, BL, TL
        const edgesStr = tile.getOrientedEdges().map(e => e === 1 ? 'T' : 'B').join('');
        tileElement.textContent = `${tile.id.substring(0,4)} (${edgesStr})`; // Short ID + Edges
        tileElement.title = `Edges: ${edgesStr}`;


        if (!isBoardTile) { // Tiles in hand are draggable
            tileElement.draggable = true;
            tileElement.addEventListener('dragstart', (event) => {
                // event.dataTransfer.setData('text/plain', tile.id); // Not strictly needed if using selectedTile
                selectTileFromHand(tile, tileElement, tile.playerId);
            });
        } else {
            // Style for tiles on board - they might be smaller or positioned absolutely
            // For now, they are just placed into the grid cells
        }
        return tileElement;
    }

    function updateGameInfo() {
        currentPlayerDisplay.textContent = `Current Player: Player ${currentPlayer}`;
        player1ScoreDisplay.textContent = `Player 1 Score: ${player1Score}`;
        player2ScoreDisplay.textContent = `Player 2 Score: ${player2Score}`;
    }

    // --- Game Initialization ---
    function initializeGame() {
        console.log("Initializing game...");
        player1Hand = generateUniqueTilesForPlayer(1, NUM_TILES_PER_PLAYER);
        player2Hand = generateUniqueTilesForPlayer(2, NUM_TILES_PER_PLAYER);

        currentPlayer = 1;
        player1Score = 0;
        player2Score = 0;
        selectedTile = null;
        boardState = {};

        initializeGameBoard(); // Create the grid cells

        displayPlayerHand(1, player1Hand, player1HandDisplay);
        displayPlayerHand(2, player2Hand, player2HandDisplay);

        updateGameInfo();
        gameMessageDisplay.textContent = "Player 1's turn. Select a tile and place it on the board.";
        gameInitialized = true;
        console.log("Game initialized. Player 1 hand:", player1Hand, "Player 2 hand:", player2Hand);
    }

    // --- Player Actions ---
    function selectTileFromHand(tile, tileElement, playerId) {
        if (playerId !== currentPlayer) {
            gameMessageDisplay.textContent = "It's not your turn!";
            return;
        }
        if (selectedTile && selectedTile.handElement) {
            selectedTile.handElement.classList.remove('selected');
        }
        selectedTile = { tile: tile, handElement: tileElement, originalPlayerId: playerId };
        tileElement.classList.add('selected');
        gameMessageDisplay.textContent = `Player ${currentPlayer} selected tile ${tile.id}. Click on the board to place it.`;
        console.log("Selected tile:", selectedTile);
    }

    function handleCellClick(x, y) {
        console.log(`Cell clicked: x=${x}, y=${y}`);
        if (!selectedTile) {
            gameMessageDisplay.textContent = "Please select a tile from your hand first.";
            return;
        }
        if (selectedTile.originalPlayerId !== currentPlayer) {
            gameMessageDisplay.textContent = "Error: Tile selection does not match current player."; // Should not happen
            return;
        }

        if (placeTileOnBoard(selectedTile.tile, x, y)) {
            // Remove from hand
            if (currentPlayer === 1) {
                player1Hand = player1Hand.filter(t => t.id !== selectedTile.tile.id);
                displayPlayerHand(1, player1Hand, player1HandDisplay);
            } else {
                player2Hand = player2Hand.filter(t => t.id !== selectedTile.tile.id);
                displayPlayerHand(2, player2Hand, player2HandDisplay);
            }

            selectedTile.handElement.remove(); // Remove from DOM
            selectedTile = null;

            if (checkGameEnd()) {
                endGame();
            } else {
                switchTurn();
            }
        } else {
            // Placement was invalid, message already set by isPlacementValid
            console.log("Invalid placement.");
        }
    }

    function placeTileOnBoard(tile, x, y) {
        if (!isPlacementValid(tile, x, y)) {
            return false;
        }

        tile.x = x;
        tile.y = y;
        boardState[`${x},${y}`] = tile;

        // Update the visual board
        const cell = getBoardCell(x,y);
        if (cell) {
            cell.innerHTML = ''; // Clear any previous content (e.g. 'drop-target' text)
            const tileElement = createTileElement(tile, true); // isBoardTile = true
            // For a grid, we append to cell. For absolute positioning, this would be different.
            cell.appendChild(tileElement);
            cell.classList.remove('drop-target'); // ensure it's removed
        } else {
            console.error(`Could not find cell ${x},${y} to place tile.`);
            // This should not happen if initializeGameBoard worked
            return false;
        }

        console.log(`Tile ${tile.id} placed at ${x},${y}`);
        return true;
    }

    // --- Game Logic: Validation, Turns, End, Scoring ---
    function isPlacementValid(tile, x, y, isDragOver = false) {
        const targetKey = `${x},${y}`;
        if (boardState[targetKey]) {
            if (!isDragOver) gameMessageDisplay.textContent = "This cell is already occupied.";
            return false; // Cell occupied
        }

        const placedTilesCount = Object.keys(boardState).length;
        const orientedEdges = tile.getOrientedEdges(); // Use current orientation

        if (placedTilesCount === 0) {
            // First tile can be placed anywhere (usually center, but for grid, any empty cell)
            if (!isDragOver) gameMessageDisplay.textContent = "First tile placed.";
            return true;
        }

        // Subsequent tiles must touch at least one existing tile and match edges.
        let touchesExistingTile = false;
        const neighbors = getNeighbors(x, y); // Get logical neighbors for a hex grid

        for (const neighborInfo of neighbors) {
            const {nx, ny, edgeIndexOnNewTile, edgeIndexOnNeighborTile} = neighborInfo;
            const neighborKey = `${nx},${ny}`;
            const neighborTile = boardState[neighborKey];

            if (neighborTile) {
                touchesExistingTile = true;
                const neighborOrientedEdges = neighborTile.getOrientedEdges();
                const newTileEdgeType = orientedEdges[edgeIndexOnNewTile];
                const neighborEdgeType = neighborOrientedEdges[edgeIndexOnNeighborTile];

                if (newTileEdgeType !== neighborEdgeType) {
                    if (!isDragOver) gameMessageDisplay.textContent = `Edge mismatch with neighbor at ${nx},${ny}. New: ${newTileEdgeType}, Neighbor: ${neighborEdgeType}`;
                    return false; // Edge types do not match
                }
            }
        }

        if (!touchesExistingTile) {
            if (!isDragOver) gameMessageDisplay.textContent = "Tile must touch an existing tile.";
            return false;
        }

        if (!isDragOver) gameMessageDisplay.textContent = "Valid placement.";
        return true;
    }

    // Placeholder for hex grid neighbor logic.
    // This is CRITICAL and needs to be accurate for a hex grid.
    // For a square grid, neighbors are simpler (up, down, left, right).
    // For a hex grid (axial or cube coordinates usually):
    // Assuming "odd-r" or "even-r" shoves for visual row staggering if using a square grid to simulate hex.
    // Or, if using true hex coordinates, this is more direct.
    // For now, let's use a simplified square grid adjacency for demonstration,
    // understanding this needs to be replaced with proper hex logic.
    // Edges: 0:Top, 1:TopRight, 2:BottomRight, 3:Bottom, 4:BottomLeft, 5:TopLeft (clockwise)
    // This function needs to map (x,y) + edge to neighbor (nx,ny) + corresponding edge on neighbor
    function getNeighbors(x, y) {
        // This is a placeholder for square grid logic. Will need to be updated for hex.
        // For a square grid interpretation, these are not hex edges.
        // This needs a full rewrite for hex geometry.
        const potentialNeighbors = []; // Corrected line: was an unterminated array literal containing subsequent code.
            // For a simple square grid:
            // { dx: 0, dy: -1, edgeOnNew: 0 (N), edgeOnNeighbor: 2 (S) on tile above }
            // { dx: 1, dy: 0,  edgeOnNew: 1 (E), edgeOnNeighbor: 3 (W) on tile to right }
            // ... this is not how hex edges work.

            // Placeholder for conceptual hex neighbors (e.g., using axial coordinates)
            // This mapping of dx,dy to edge indices is highly dependent on the coordinate system.
            // Example: if (0,0) is top-left, and rows are horizontal.
            // This is a MAJOR simplification and likely incorrect for true hex.
            // It assumes a simple grid and tries to map to hex edge numbers.
            // THIS IS THE HARDEST PART TO GET RIGHT WITHOUT A PROPER HEX GRID SYSTEM.

            // Let's assume an "odd-r" or "even-r" layout if we are using a square grid.
            // Parity of y (row) affects horizontal neighbors.
        const isEvenRow = y % 2 === 0;
        let neighborDefs = [];

        if (isEvenRow) {
            neighborDefs = [
                { dx: 1,  dy: 0,  edgeIndexOnNewTile: 1, edgeIndexOnNeighborTile: 4 }, // Right
                { dx: 0,  dy: 1,  edgeIndexOnNewTile: 2, edgeIndexOnNeighborTile: 5 }, // Bottom-Right
                { dx: -1, dy: 1,  edgeIndexOnNewTile: 3, edgeIndexOnNeighborTile: 0 }, // Bottom-Left
                { dx: -1, dy: 0,  edgeIndexOnNewTile: 4, edgeIndexOnNeighborTile: 1 }, // Left
                { dx: -1, dy: -1, edgeIndexOnNewTile: 5, edgeIndexOnNeighborTile: 2 }, // Top-Left
                { dx: 0,  dy: -1, edgeIndexOnNewTile: 0, edgeIndexOnNeighborTile: 3 }  // Top-Right
            ];
        } else { // Odd row
            neighborDefs = [
                { dx: 1,  dy: 0,  edgeIndexOnNewTile: 1, edgeIndexOnNeighborTile: 4 }, // Right
                { dx: 1,  dy: 1,  edgeIndexOnNewTile: 2, edgeIndexOnNeighborTile: 5 }, // Bottom-Right
                { dx: 0,  dy: 1,  edgeIndexOnNewTile: 3, edgeIndexOnNeighborTile: 0 }, // Bottom-Left
                { dx: -1, dy: 0,  edgeIndexOnNewTile: 4, edgeIndexOnNeighborTile: 1 }, // Left
                { dx: 0,  dy: -1, edgeIndexOnNewTile: 5, edgeIndexOnNeighborTile: 2 }, // Top-Left
                { dx: 1,  dy: -1, edgeIndexOnNewTile: 0, edgeIndexOnNeighborTile: 3 }  // Top-Right
            ];
        }
        // The above edgeIndexOnNewTile and edgeIndexOnNeighborTile must be carefully chosen
        // such that they represent opposite edges. E.g., edge 0 of new tile connects to edge 3 of neighbor.
        // My values: 0-3, 1-4, 2-5 are opposite pairs.

        const neighbors = [];
        for (const def of neighborDefs) {
                neighbors.push({
                    nx: x + def.dx,
                    ny: y + def.dy,
                    edgeIndexOnNewTile: def.edgeIndexOnNewTile, // Which edge of the tile being placed
                    edgeIndexOnNeighborTile: def.edgeIndexOnNeighborTile // Which edge of the existing neighbor
                });
            }
            return neighbors;
    }


    function switchTurn() {
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        updateGameInfo();
        gameMessageDisplay.textContent = `Player ${currentPlayer}'s turn.`;
        console.log(`Switched turn to Player ${currentPlayer}`);
    }

    function checkGameEnd() {
        return player1Hand.length === 0 && player2Hand.length === 0;
    }

    function endGame() {
        calculateScores();
        let winnerMessage = "";
        if (player1Score > player2Score) {
            winnerMessage = `Player 1 wins with ${player1Score} points! (Player 2: ${player2Score})`;
        } else if (player2Score > player1Score) {
            winnerMessage = `Player 2 wins with ${player2Score} points! (Player 1: ${player1Score})`;
        } else {
            winnerMessage = `It's a tie! Both players have ${player1Score} points.`;
        }
        gameMessageDisplay.textContent = `Game Over! ${winnerMessage}`;
        currentPlayerDisplay.textContent = "Game Finished";
        console.log("Game ended. ", winnerMessage);
        // Disable further moves, or handle via selectedTile being null / hands empty
    }

    function calculateScores() {
        player1Score = 0;
        player2Score = 0;

        for (const key in boardState) {
            const tile = boardState[key];
            const { x, y } = tile;
            const orientedEdges = tile.getOrientedEdges();
            const neighbors = getNeighbors(x, y);

            for (const neighborInfo of neighbors) {
                const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
                const neighborTile = boardState[neighborKey];

                if (neighborTile && neighborTile.playerId === tile.playerId) { // Only count connections of same player's tiles
                    const edgeOnThisTile = orientedEdges[neighborInfo.edgeIndexOnNewTile];
                    const neighborOrientedEdges = neighborTile.getOrientedEdges();
                    const edgeOnNeighborTile = neighborOrientedEdges[neighborInfo.edgeIndexOnNeighborTile];

                    // If both connected edges are triangles (type 1)
                    if (edgeOnThisTile === 1 && edgeOnNeighborTile === 1) {
                        if (tile.playerId === 1) {
                            player1Score++;
                        } else {
                            player2Score++;
                        }
                    }
                }
            }
        }
        // Each connection is counted twice (once for each tile in the pair), so divide by 2.
        player1Score /= 2;
        player2Score /= 2;

        updateGameInfo();
        console.log(`Scores calculated: P1: ${player1Score}, P2: ${player2Score}`);
    }


    // --- Event Listeners ---
    resetGameButton.addEventListener('click', () => {
        console.log("Reset game button clicked.");
        if (gameInitialized) {
             // Clear visual board cells content
            const cells = gameBoard.querySelectorAll('.board-cell');
            cells.forEach(cell => cell.innerHTML = '');
        }
        initializeGame();
    });

    // --- Start the game ---
    initializeGame();
});
