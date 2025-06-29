document.addEventListener('DOMContentLoaded', () => {
    const BOARD_SIZE = 15; // Example size, can be adjusted. This will define the logical grid.
    const NUM_TILES_PER_PLAYER = 14;

    // Canvas setup
    const gameCanvas = document.getElementById('game-canvas');
    const ctx = gameCanvas.getContext('2d');
    // gameBoard variable now refers to the canvas element for consistency,
    // though we'll primarily use ctx for drawing.
    const gameBoard = gameCanvas; // Keep existing references if they are used for width/height etc.

    const player1HandDisplay = document.querySelector('#player1-hand .tiles-container');
    const player2HandDisplay = document.querySelector('#player2-hand .tiles-container');
    const currentPlayerDisplay = document.getElementById('current-player');
    const gameMessageDisplay = document.getElementById('game-message');
    const player1ScoreDisplay = document.getElementById('player1-score');
    const player2ScoreDisplay = document.getElementById('player2-score');
    const resetGameButton = document.getElementById('reset-game');
    const player1HandContainer = document.getElementById('player1-hand');
    const player2HandContainer = document.getElementById('player2-hand');
    const aiToggle = document.getElementById('ai-toggle');

    let boardState = {}; // Using an object to store tile placements: 'x,y': tileObject
    let player1Hand = [];
    let player2Hand = [];
    let currentPlayer = 1; // Player 1 starts
    let player1Score = 0;
    let player2Score = 0;
    let selectedTile = null; // { tile: tileObject, handElement: tileElement }
    let gameInitialized = false;
    let isRemovingTiles = false; // Tracks if the game is in the tile removal phase
    let currentSurroundedTilesForRemoval = []; // Stores tiles that can be removed by the current player
    let isAiPlayerActive = false;

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

        rotate() {
            this.orientation = (this.orientation + 1) % 6;
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
        get getPlayerColor() {
            return this.playerId === 1 ? 'lightblue' : 'lightcoral';
        }
    }

    function removeTileFromBoardAndReturnToHand(tileToRemove) {
        console.log(`Removing tile ${tileToRemove.id} at (${tileToRemove.x}, ${tileToRemove.y}) for player ${tileToRemove.playerId}`);

        // 1. Remove from boardState
        const tileKey = `${tileToRemove.x},${tileToRemove.y}`;
        delete boardState[tileKey];

        // 2. Return to Owner's Hand
        if (tileToRemove.playerId === 1) {
            player1Hand.push(tileToRemove);
        } else {
            player2Hand.push(tileToRemove);
        }

        // 3. Reset Tile Properties
        tileToRemove.x = null;
        tileToRemove.y = null;
        tileToRemove.orientation = 0; // Reset orientation

        // 4. Update Owner's Hand Display
        if (tileToRemove.playerId === 1) {
            displayPlayerHand(1, player1Hand, player1HandDisplay);
        } else {
            displayPlayerHand(2, player2Hand, player2HandDisplay);
        }

        // 5. Redraw Board
        redrawBoardOnCanvas(); // This will also clear old highlights if isRemovingTiles becomes false

        // 6. Check for More Surrounded Tiles
        const newSurroundedList = getSurroundedTiles(boardState);
        currentSurroundedTilesForRemoval = newSurroundedList; // Update the global list

        if (newSurroundedList.length > 0) {
            // Still more tiles to remove, continue the process
            console.log("More surrounded tiles found:", newSurroundedList.map(t => t.id));
            // Update message and keep isRemovingTiles = true (already true)
            gameMessageDisplay.textContent = `Player ${currentPlayer}, click on a highlighted tile to remove it.`;
            redrawBoardOnCanvas(); // Redraw to update highlights if any changed
        } else {
            // No more tiles are surrounded, end the removal phase and proceed with game turn
            console.log("No more surrounded tiles. Ending removal phase.");
            isRemovingTiles = false;
            currentSurroundedTilesForRemoval = []; // Clear the list

            gameMessageDisplay.textContent = "Tile removal complete. Finishing turn."; // Temporary message

            calculateScores();
            if (checkGameEnd()) {
                endGame();
            } else {
                switchTurn();
            }
        }
    }

    // Function to redraw the entire board state onto the canvas
    function redrawBoardOnCanvas() {
        // Ensure canvas is cleared and background drawn before redrawing tiles
        ctx.fillStyle = '#ddd'; // Background color
        ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
        ctx.strokeStyle = '#aaa'; // Border color
        ctx.strokeRect(0, 0, gameCanvas.width, gameCanvas.height);

        // Placeholder for converting logical grid (tile.x, tile.y) to canvas pixels (cx, cy)
        // This needs a proper hexagonal grid coordinate system implementation later (Step 6).
        // Using a simple mapping for now for visualization.
        // const CANVAS_OFFSET_X = HEX_WIDTH / 1.5; // Now global
        // const CANVAS_OFFSET_Y = HEX_HEIGHT / 1.5; // Now global

        for (const key in boardState) {
            const tile = boardState[key];
            if (tile.x === null || tile.y === null) continue;

            let cx, cy;
            // For flat-topped:
            // x = size * (     3/2 * q                   )
            // y = size * (sqrt(3)/2 * q  +  sqrt(3) * r)
            // Assuming tile.x = q, tile.y = r
             cx = CANVAS_OFFSET_X + HEX_SIDE_LENGTH * (3/2 * tile.x);
             cy = CANVAS_OFFSET_Y + HEX_SIDE_LENGTH * (Math.sqrt(3)/2 * tile.x + Math.sqrt(3) * tile.y);

            drawHexTile(ctx, cx, cy, tile);

            // Highlight if in removal mode and tile is one of the surrounded ones
            if (isRemovingTiles && currentSurroundedTilesForRemoval.some(st => st.id === tile.id)) {
                ctx.strokeStyle = 'red'; // Highlight color
                ctx.lineWidth = 3;
                // Re-draw the hexagon border for highlight
                ctx.beginPath();
                const vertices = [];
                for (let i = 0; i < 6; i++) {
                    const angle = Math.PI / 180 * (60 * i);
                    vertices.push({
                        x: cx + HEX_SIDE_LENGTH * Math.cos(angle),
                        y: cy + HEX_SIDE_LENGTH * Math.sin(angle)
                    });
                }
                ctx.moveTo(vertices[0].x, vertices[0].y);
                for (let i = 1; i < 6; i++) {
                    ctx.lineTo(vertices[i].x, vertices[i].y);
                }
                ctx.closePath();
                ctx.stroke();
            }
        }
    }

    // --- Tile Generation ---
    // const UNIQUE_TILE_PATTERNS = [  // This is a duplicate, removing
    //     [0,0,0,0,0,0], // 0 triangles
    //     [1,0,0,0,0,0], // 1 triangle
    //     [1,1,0,0,0,0], // 2 triangles, adjacent
    //     [1,0,1,0,0,0], // 2 triangles, separated by 1
    //     [1,0,0,1,0,0], // 2 triangles, separated by 2 (opposite)
    //     [1,1,1,0,0,0], // 3 triangles, block of 3
    //     [1,1,0,1,0,0], // 3 triangles, pattern 110100
    //     [1,0,1,1,0,0], // 3 triangles, pattern 101100 (or rotated 110010)
    //     [1,0,1,0,1,0], // 3 triangles, alternating
    //     [1,1,1,1,0,0], // 4 triangles (complement of 2 blanks adjacent)
    //     [1,1,0,1,1,0], // 4 triangles (complement of 2 blanks separated by 1)
    //     [1,0,1,1,0,1], // 4 triangles (complement of 2 blanks separated by 2, e.g. 110101)
    //     [1,1,1,1,1,0], // 5 triangles
    //     [1,1,1,1,1,1]  // 6 triangles
    // ];

    function generateUniqueTilesForPlayer(playerId, count) {
        const tiles = [];
        if (count !== UNIQUE_TILE_PATTERNS.length) {
            console.warn(`Requested ${count} tiles, but there are ${UNIQUE_TILE_PATTERNS.length} unique patterns defined. Using unique patterns count.`);
        }

        UNIQUE_TILE_PATTERNS.forEach((pattern, index) => {
            // Ensure a copy of the pattern is used for the tile's edges
            tiles.push(new HexTile(`p${playerId}t${index}`, playerId, [...pattern]));
        });

        return tiles;
    }

    // --- Game Board Logic ---
    function initializeGameBoard() {
        // Clear the canvas
        ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
        // Optionally, draw a background or grid lines on the canvas here
        // For example, a simple background:
        ctx.fillStyle = '#ddd'; // Same as old #game-board background
        ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
        ctx.strokeStyle = '#aaa'; // Same as old #game-board border
        ctx.strokeRect(0, 0, gameCanvas.width, gameCanvas.height);


        boardState = {}; // Reset board state
        // The old cell creation loop is removed.
        // Event listeners for drag/drop on cells are removed.
        // Click handling will be added directly to the canvas later.
        console.log("Game board canvas initialized and cleared.");
    }

    // This function is no longer needed as we don't have individual cell DOM elements.
    // function getBoardCell(x, y) {
    //     return gameBoard.querySelector(`.board-cell[data-x="${x}"][data-y="${y}"]`);
    // }

    // --- Tile Generation ---
    const UNIQUE_TILE_PATTERNS = [
        [0,0,0,0,0,0], // 0 triangles
        [1,0,0,0,0,0], // 1 triangle
        [1,1,0,0,0,0], // 2 triangles, adjacent
        [1,0,1,0,0,0], // 2 triangles, separated by 1
        [1,0,0,1,0,0], // 2 triangles, separated by 2 (opposite)
        [1,1,1,0,0,0], // 3 triangles, block of 3
        [1,1,0,1,0,0], // 3 triangles, pattern 110100
        [1,0,1,1,0,0], // 3 triangles, pattern 101100 (or rotated 110010)
        [1,0,1,0,1,0], // 3 triangles, alternating
        [1,1,1,1,0,0], // 4 triangles (complement of 2 blanks adjacent)
        [1,1,1,0,1,0], // 4 triangles (TTTBTB, formerly TTBTTB)
        [1,0,1,1,0,1], // 4 triangles (complement of 2 blanks separated by 2, e.g. 110101)
        [1,1,1,1,1,0], // 5 triangles
        [1,1,1,1,1,1]  // 6 triangles
    ];

    function generateUniqueTilesForPlayer(playerId, count) {
        const tiles = [];
        if (count !== UNIQUE_TILE_PATTERNS.length) {
            console.warn(`Requested ${count} tiles, but there are ${UNIQUE_TILE_PATTERNS.length} unique patterns defined. Using unique patterns count.`);
        }

        UNIQUE_TILE_PATTERNS.forEach((pattern, index) => {
            // Ensure a copy of the pattern is used for the tile's edges
            tiles.push(new HexTile(`p${playerId}t${index}`, playerId, [...pattern]));
        });

        return tiles;
    }

    // --- Game Board Logic ---
    function initializeGameBoard() {
        // Clear the canvas
        ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
        // Optionally, draw a background or grid lines on the canvas here
        // For example, a simple background:
        ctx.fillStyle = '#ddd'; // Same as old #game-board background
        ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
        ctx.strokeStyle = '#aaa'; // Same as old #game-board border
        ctx.strokeRect(0, 0, gameCanvas.width, gameCanvas.height);


        boardState = {}; // Reset board state
        // The old cell creation loop is removed.
        // Event listeners for drag/drop on cells are removed.
        // Click handling will be added directly to the canvas later.
        console.log("Game board canvas initialized and cleared.");
        redrawBoardOnCanvas(); // Ensure board is drawn (empty at this stage)
    }

    // --- Canvas Drawing Functions ---
    const HEX_SIDE_LENGTH = 40; // pixels
    const HEX_HEIGHT = Math.sqrt(3) * HEX_SIDE_LENGTH;
    const HEX_WIDTH = 2 * HEX_SIDE_LENGTH;
    const HEX_APOTHEM = HEX_HEIGHT / 2; // Distance from center to midpoint of a side
    const CANVAS_OFFSET_X = HEX_WIDTH / 1.5; // Initial offset from canvas left edge for drawing grid
    const CANVAS_OFFSET_Y = HEX_HEIGHT / 1.5; // Initial offset from canvas top edge for drawing grid

    // Function to draw a single hexagonal tile on the canvas
    // ctx: canvas rendering context
    // cx, cy: center coordinates of the hexagon on the canvas
    // tile: the HexTile object to draw
    function drawHexTile(ctx, cx, cy, tile) {
        const orientedEdges = tile.getOrientedEdges();

        // Calculate hexagon vertices (flat-topped hexagon)
        // Order: Top-right, Right, Bottom-right, Bottom-left, Left, Top-left
        const vertices = [];
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 180 * (60 * i); // Removed +30 degrees
            vertices.push({
                x: cx + HEX_SIDE_LENGTH * Math.cos(angle),
                y: cy + HEX_SIDE_LENGTH * Math.sin(angle)
            });
        }

        // Draw hexagon body
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < 6; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = 'white'; // Set body to white
        ctx.fill();
        ctx.strokeStyle = '#333'; // Border color for the hexagon
        ctx.lineWidth = 1;
        ctx.stroke();

        // Check if the tile is all blank
        const isAllBlank = orientedEdges.every(edge => edge === 0);

        if (isAllBlank) {
            // Draw a small hexagon in the center
            const innerHexSideLength = HEX_SIDE_LENGTH / 6; // Adjust size as needed
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = Math.PI / 180 * (60 * i);
                const x = cx + innerHexSideLength * Math.cos(angle);
                const y = cy + innerHexSideLength * Math.sin(angle);
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
            ctx.fillStyle = tile.getPlayerColor;
            ctx.fill();
        }

        // Draw edges (triangles or blanks)
        for (let i = 0; i < 6; i++) {
            const edgeType = orientedEdges[i];
            const v1 = vertices[i];
            const v2 = vertices[(i + 1) % 6]; // Next vertex

            // Midpoint of the current edge
            const midX = (v1.x + v2.x) / 2;
            const midY = (v1.y + v2.y) / 2;

            // Normal vector (pointing outwards) - derived from edge vector rotated 90 deg
            // Edge vector: (v2.x - v1.x, v2.y - v1.y)
            // Normal: (v1.y - v2.y, v2.x - v1.x) -- then normalize and scale
            let nx = v1.y - v2.y;
            let ny = v2.x - v1.x;
            const len = Math.sqrt(nx * nx + ny * ny);
            nx /= len;
            ny /= len;

            if (edgeType === 1) { // Triangle
                // Step 1: Calculate the new dimensions for the equilateral triangle.
                const triangleEdgeLength = HEX_SIDE_LENGTH * 0.8;
                const triangleHeight = (Math.sqrt(3) / 2) * triangleEdgeLength;

                // Tip of the triangle (outwards from the edge midpoint along the normal)
                const tipX = midX + nx * triangleHeight;
                const tipY = midY + ny * triangleHeight;

                // Calculate base points of the triangle along the hexagon edge
                // The base of the equilateral triangle has length triangleEdgeLength.
                // The two base vertices are triangleEdgeLength / 2 from the midX, midY along the edge vector.
                const halfBase = triangleEdgeLength / 2;

                // Vector along the edge (from v1 to v2), normalized
                const edgeDirX = (v2.x - v1.x) / len;
                const edgeDirY = (v2.y - v1.y) / len;

                const base1X = midX - edgeDirX * halfBase;
                const base1Y = midY - edgeDirY * halfBase;
                const base2X = midX + edgeDirX * halfBase;
                const base2Y = midY + edgeDirY * halfBase;

                ctx.beginPath();
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(base1X, base1Y);
                ctx.lineTo(base2X, base2Y);
                ctx.closePath();
                ctx.fillStyle = tile.getPlayerColor; // Use player's color for the triangle
                ctx.fill();

            } else { // Blank edge (draw a simple line or nothing)
                // Example: Draw a subtle line for blank edges
                ctx.beginPath();
                ctx.moveTo(v1.x, v1.y);
                ctx.lineTo(v2.x, v2.y);
                ctx.strokeStyle = 'grey'; // Color for blank edge indication
                ctx.lineWidth = 2; // Make it slightly thicker or different
                ctx.stroke();
            }
        }
    }


    // --- Display Logic ---
    function displayPlayerHand(player, hand, handDisplayElement) {
        handDisplayElement.innerHTML = ''; // Clear previous tiles
        hand.forEach(tile => {
            // Create a canvas for each tile in hand
            const tileCanvas = document.createElement('canvas');
            // Set canvas dimensions - ensure HEX_WIDTH and HEX_HEIGHT are appropriate for hand tiles
            // These are defined globally, so they should be available.
            // May need to adjust if hand tiles should be smaller than board tiles.
            // For now, use the same size as board tiles.
            tileCanvas.width = HEX_WIDTH + 10; // Add some padding for potential borders/effects
            tileCanvas.height = HEX_HEIGHT + 10; // Add some padding
            tileCanvas.style.cursor = 'pointer';
            tileCanvas.style.margin = '5px'; // Add some margin for spacing

            const tileCtx = tileCanvas.getContext('2d');

            // Calculate center for drawing the tile within its canvas
            const cx = tileCanvas.width / 2;
            const cy = tileCanvas.height / 2;

            drawHexTile(tileCtx, cx, cy, tile); // Draw the tile

            // Event listener for selecting the tile
            tileCanvas.addEventListener('click', () => {
                // Pass the tile object and the canvas element itself for potential highlighting
                selectTileFromHand(tile, tileCanvas, player);
            });

            handDisplayElement.appendChild(tileCanvas);
        });
    }

    /*
    function createTileElement(tile, isBoardTile = false) {
        const tileElement = document.createElement('div');
        tileElement.classList.add('hexagon-tile');
        tileElement.classList.add(tile.playerId === 1 ? 'player1' : 'player2');
        tileElement.dataset.tileId = tile.id;
        tileElement.style.backgroundColor = tile.color; // Redundant with class but fine

        // Remove old text representation
        // const edgesStr = tile.getOrientedEdges().map(e => e === 1 ? 'T' : 'B').join('');
        // tileElement.textContent = `${tile.id.substring(0,4)} (${edgesStr})`;
        // tileElement.title = `Edges: ${edgesStr}`;

        const orientedEdges = tile.getOrientedEdges();
        for (let i = 0; i < 6; i++) {
            const edgeDiv = document.createElement('div');
            edgeDiv.classList.add('hexagon-edge');
            edgeDiv.classList.add(`edge-${i}`); // Positional class

            if (orientedEdges[i] === 1) { // Triangle
                edgeDiv.classList.add('edge-triangle');
            } else { // Blank
                edgeDiv.classList.add('edge-blank');
            }
            tileElement.appendChild(edgeDiv);
        }

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
    */

    function updateGameInfo() {
        currentPlayerDisplay.textContent = `Current Player: Player ${currentPlayer}`;
        player1ScoreDisplay.textContent = `Player 1 Score: ${player1Score}`;
        player2ScoreDisplay.textContent = `Player 2 Score: ${player2Score}`;
        updateHandHighlights(); // Update hand highlights based on current player
    }

    function updateHandHighlights() {
        if (currentPlayer === 1) {
            player1HandContainer.classList.add('active-hand');
            player1HandContainer.classList.remove('inactive-hand');
            player2HandContainer.classList.add('inactive-hand');
            player2HandContainer.classList.remove('active-hand');
        } else {
            player2HandContainer.classList.add('active-hand');
            player2HandContainer.classList.remove('inactive-hand');
            player1HandContainer.classList.add('inactive-hand');
            player1HandContainer.classList.remove('active-hand');
        }
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

        updateGameInfo(); // This will now also call updateHandHighlights
        gameMessageDisplay.textContent = "Player 1's turn. Select a tile and place it on the board.";
        gameInitialized = true;
        console.log("Game initialized. Player 1 hand:", player1Hand, "Player 2 hand:", player2Hand);
    }

    // --- Player Actions ---
    let currentlySelectedTileCanvas = null; // Keep track of the currently selected canvas tile in hand

    function selectTileFromHand(tile, tileCanvasElement, playerId) {
        if (playerId !== currentPlayer) {
            gameMessageDisplay.textContent = "It's not your turn!";
            return;
        }

        // Check if the clicked tile is already selected
        if (selectedTile && selectedTile.tile.id === tile.id) {
            // Tile is already selected, so rotate it
            selectedTile.tile.rotate();
            console.log(`Tile ${selectedTile.tile.id} rotated by clicking. New orientation: ${selectedTile.tile.orientation}`);

            // Re-draw the selected tile in the hand
            const tileCtx = tileCanvasElement.getContext('2d');
            const cx = tileCanvasElement.width / 2;
            const cy = tileCanvasElement.height / 2;

            // Clear the specific tile canvas before redrawing
            tileCtx.clearRect(0, 0, tileCanvasElement.width, tileCanvasElement.height);
            drawHexTile(tileCtx, cx, cy, selectedTile.tile);

            gameMessageDisplay.textContent = `Tile rotated. Press 'r' or click tile to rotate again. Click board to place.`;
        } else {
            // This is a new selection or a switch from another tile

            // Remove highlight from previously selected tile canvas
            if (currentlySelectedTileCanvas) {
                currentlySelectedTileCanvas.style.border = 'none'; // Or revert to its original border
                currentlySelectedTileCanvas.style.boxShadow = 'none';
            }

            // Highlight the new selected tile canvas
            tileCanvasElement.style.border = '3px solid gold';
            tileCanvasElement.style.boxShadow = '0 0 10px gold';
            currentlySelectedTileCanvas = tileCanvasElement;

            // Update selectedTile global variable
            selectedTile = { tile: tile, handElement: tileCanvasElement, originalPlayerId: playerId };

            gameMessageDisplay.textContent = `Player ${currentPlayer} selected tile ${tile.id}. Press 'r' or click tile to rotate. Click on the board to place it.`;
            console.log("Selected tile:", selectedTile);
        }
    }

    // Add a global event listener for keydown
    document.addEventListener('keydown', (event) => {
        if (event.key === 'r' || event.key === 'R') {
            if (selectedTile && selectedTile.tile && selectedTile.handElement) {
                selectedTile.tile.rotate();
                console.log(`Tile ${selectedTile.tile.id} rotated. New orientation: ${selectedTile.tile.orientation}`);

                // Re-draw the selected tile in the hand
                const tileCanvas = selectedTile.handElement;
                const tileCtx = tileCanvas.getContext('2d');
                const cx = tileCanvas.width / 2;
                const cy = tileCanvas.height / 2;

                // Clear the specific tile canvas before redrawing
                tileCtx.clearRect(0, 0, tileCanvas.width, tileCanvas.height);
                drawHexTile(tileCtx, cx, cy, selectedTile.tile);

                // Update game message if needed, or rely on the selection message
                gameMessageDisplay.textContent = `Tile rotated. Press 'r' to rotate again. Click board to place.`;
            }
        }
    });

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
                // displayPlayerHand(1, player1Hand, player1HandDisplay); // Re-rendering the hand is done by initializeGame or if explicitly needed
            } else {
                player2Hand = player2Hand.filter(t => t.id !== selectedTile.tile.id);
                // displayPlayerHand(2, player2Hand, player2HandDisplay);
            }

            selectedTile.handElement.remove(); // Remove the canvas from DOM
            selectedTile = null;
            currentlySelectedTileCanvas = null; // Clear the reference to the selected canvas

            // Refresh the current player's hand display after a tile is placed
            if (currentPlayer === 1) {
                displayPlayerHand(1, player1Hand, player1HandDisplay);
            } else {
                displayPlayerHand(2, player2Hand, player2HandDisplay);
            }

            // Instead of directly calculating scores and switching turns,
            // call the new function to check for surrounded tiles.
            checkForSurroundedTilesAndProceed();

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

        // Visual update will be handled by a dedicated drawing function that iterates boardState
        // and draws all tiles on the canvas. This function will be called after successful placement.
        console.log(`Tile ${tile.id} placed at ${x},${y}. Board state updated.`);
        redrawBoardOnCanvas(); // Redraw the entire board with the new tile

        // const cell = getBoardCell(x,y); // Obsolete
        // if (cell) { ... } // Obsolete
        return true;
    }

    // --- Game Logic: Validation, Turns, End, Scoring ---
        // This function will be called from handleCellClick after a tile is placed.
        function checkForSurroundedTilesAndProceed() {
            const surroundedTiles = getSurroundedTiles(boardState);
            if (surroundedTiles.length > 0) {
                isRemovingTiles = true; // This will be set true inside processTileRemoval as well
                processTileRemoval(surroundedTiles);
            } else {
                isRemovingTiles = false; // Ensure it's reset if no tiles were surrounded
                calculateScores(); // Update scores after each turn
                if (checkGameEnd()) {
                    endGame();
                } else {
                    switchTurn();
                }
            }
        }

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
    // This function needs to map (q,r) + edge to neighbor (nq,nr) + corresponding edge on neighbor
    // Uses axial coordinates (q, r) for flat-topped hexagons.
    // Canonical edge order (matches drawing loop for vertices i to i+1):
    // 0: Right         (points to neighbor at q+1, r)
    // 1: Bottom-Right  (points to neighbor at q,   r+1)
    // 2: Bottom-Left   (points to neighbor at q-1, r+1)
    // 3: Left          (points to neighbor at q-1, r)
    // 4: Top-Left      (points to neighbor at q,   r-1)
    // 5: Top-Right     (points to neighbor at q+1, r-1)
    // Opposite edges: (i+3)%6
    function getNeighbors(q, r) {
        const axialDirections = [
            // dq, dr define the *neighbor's* offset from current tile (q,r)
            // edgeIndexOnNewTile is the edge of the *current* tile that points to this neighbor
            // edgeIndexOnNeighborTile is the corresponding edge on the *neighbor* tile
            { dq: +1, dr:  0, edgeIndexOnNewTile: 0, edgeIndexOnNeighborTile: 3 }, // Right
            { dq:  0, dr: +1, edgeIndexOnNewTile: 1, edgeIndexOnNeighborTile: 4 }, // Bottom-Right
            { dq: -1, dr: +1, edgeIndexOnNewTile: 2, edgeIndexOnNeighborTile: 5 }, // Bottom-Left
            { dq: -1, dr:  0, edgeIndexOnNewTile: 3, edgeIndexOnNeighborTile: 0 }, // Left
            { dq:  0, dr: -1, edgeIndexOnNewTile: 4, edgeIndexOnNeighborTile: 1 }, // Top-Left
            { dq: +1, dr: -1, edgeIndexOnNewTile: 5, edgeIndexOnNeighborTile: 2 }  // Top-Right
        ];

        const neighbors = [];
        for (const dir of axialDirections) {
            neighbors.push({
                nx: q + dir.dq, // Using nx, ny for consistency with isPlacementValid which expects these field names
                ny: r + dir.dr,
                edgeIndexOnNewTile: dir.edgeIndexOnNewTile,
                edgeIndexOnNeighborTile: dir.edgeIndexOnNeighborTile
            });
        }
        return neighbors;
    }

    function isTileSurrounded(q, r, currentBoardState) {
        const neighbors = getNeighbors(q, r);
        if (neighbors.length < 6) { // Should always be 6 for a hex tile not on an edge of a finite board
            return false; // Or handle as an error, but practically means not surrounded
        }

        for (const neighborInfo of neighbors) {
            const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
            if (!currentBoardState[neighborKey]) {
                return false; // Found an empty neighboring cell
            }
        }
        return true; // All 6 neighbors are occupied
    }

    function getSurroundedTiles(currentBoardState) {
        const surroundedTiles = [];
        for (const key in currentBoardState) {
            const tile = currentBoardState[key];
            // Ensure tile.x and tile.y are not null, though they should be if in boardState
            if (tile.x !== null && tile.y !== null) {
                if (isTileSurrounded(tile.x, tile.y, currentBoardState)) {
                    surroundedTiles.push(tile);
                }
            }
        }
        return surroundedTiles;
    }

    function processTileRemoval(surroundedTiles) {
        currentSurroundedTilesForRemoval = surroundedTiles; // Store the list globally

        if (currentSurroundedTilesForRemoval.length > 0) {
            isRemovingTiles = true; // Ensure this state is active
            gameMessageDisplay.textContent = `Player ${currentPlayer}, click on a highlighted tile to remove it.`;
            console.log("Tile removal phase. Surrounded tiles:", currentSurroundedTilesForRemoval.map(t => t.id));
            redrawBoardOnCanvas(); // Redraw to show highlights
        } else {
            // This case should ideally be handled by the calling function (checkForSurroundedTilesAndProceed)
            // but as a safeguard:
            isRemovingTiles = false;
            currentSurroundedTilesForRemoval = [];
            console.log("No surrounded tiles to remove, proceeding with normal turn flow.");
            // Normal turn progression (score, end check, switch turn) would follow here
            // This is already handled by checkForSurroundedTilesAndProceed's else block
            calculateScores();
            if (checkGameEnd()) {
                endGame();
            } else {
                switchTurn();
            }
        }
    }


    function switchTurn() {
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        updateGameInfo();
        gameMessageDisplay.textContent = `Player ${currentPlayer}'s turn.`;
        console.log(`Switched turn to Player ${currentPlayer}`);

        if (isAiPlayerActive && currentPlayer === 2 && !isRemovingTiles) {
            // If AI is active, it's Player 2's turn, and not in tile removal phase
            setTimeout(performAiMove, 1000); // AI makes a move after a short delay
        } else if (isAiPlayerActive && currentPlayer === 2 && isRemovingTiles) {
            // If AI is active, it's Player 2's turn, AND it's in tile removal phase
            setTimeout(performAiTileRemoval, 1000); // AI handles tile removal
        }
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
        // initializeGame() already handles clearing the canvas and resetting state.
        initializeGame();
    });

    // --- Start the game ---
    initializeGame();

    // --- AI Toggle Event Listener ---
    aiToggle.addEventListener('change', () => {
        isAiPlayerActive = aiToggle.checked;
        console.log(`AI Player (Player 2) Active: ${isAiPlayerActive}`);
        // Potentially reset the game or update UI if needed when toggling mid-game
        // For now, it simply changes the flag. If it's AI's turn and it was just activated,
        // the AI might need to be triggered manually or wait for the next turn.
        // If a human was about to play as P2 and AI is toggled on, AI should take over.
        if (isAiPlayerActive && currentPlayer === 2 && !isRemovingTiles) {
            // If it's AI's turn (and not in removal phase), and AI was just activated, let AI make a move.
            // This prevents the game from stalling if AI is activated during P2's turn.
            // Add a small delay to ensure any ongoing human interactions (like tile selection) are cleared.
            setTimeout(performAiMove, 500);
        }
    });

    // --- Canvas Click Handling ---
    gameCanvas.addEventListener('click', (event) => {
        const rect = gameCanvas.getBoundingClientRect();
        const pixelX = event.clientX - rect.left;
        const pixelY = event.clientY - rect.top;
        const { q, r } = pixelToHexGrid(pixelX, pixelY);

        console.log(`Canvas clicked at pixel (${pixelX}, ${pixelY}), converted to hex grid (q=${q}, r=${r})`);

        if (isRemovingTiles) {
            // --- Handle Tile Removal Click ---
            const tileKey = `${q},${r}`;
            const clickedTile = boardState[tileKey];

            if (clickedTile && currentSurroundedTilesForRemoval.some(st => st.id === clickedTile.id)) {
                // Valid tile selected for removal
                removeTileFromBoardAndReturnToHand(clickedTile); // This function will be created in the next step
            } else {
                gameMessageDisplay.textContent = "Invalid selection. Click on a highlighted (surrounded) tile to remove it.";
            }
        } else {
            // --- Handle Tile Placement Click (existing logic) ---
            if (!selectedTile) {
                gameMessageDisplay.textContent = "Please select a tile from your hand first.";
                return;
            }
            if (selectedTile.originalPlayerId !== currentPlayer) {
                gameMessageDisplay.textContent = "Error: Tile selection does not match current player (should not happen).";
                return;
            }
            // For now, directly use q,r as x,y for game logic.
            // This assumes our game logic (isPlacementValid, getNeighbors) will also use q,r.
            handleCellClick(q, r);
        }
    });

    // Converts pixel coordinates on canvas to logical hex grid coordinates (q, r - axial)
    function pixelToHexGrid(pixelX, pixelY) {
        // Inverse of the drawing formula:
        // x_pixel = CANVAS_OFFSET_X + HEX_SIDE_LENGTH * (3/2 * q)
        // y_pixel = CANVAS_OFFSET_Y + HEX_SIDE_LENGTH * (sqrt(3)/2 * q + sqrt(3) * r)

        const size = HEX_SIDE_LENGTH;
        const x = pixelX - CANVAS_OFFSET_X;
        const y = pixelY - CANVAS_OFFSET_Y;

        // Convert to fractional axial coordinates (q_frac, r_frac)
        // q_frac = (2/3 * x) / size
        // r_frac = (-1/3 * x + sqrt(3)/3 * y) / size
        let q_frac = (2/3 * x) / size;
        let r_frac = (-1/3 * x + Math.sqrt(3)/3 * y) / size;

        // To round to the nearest hex, we can convert to cube coordinates, round, then convert back.
        // x_cube = q
        // z_cube = r
        // y_cube = -x_cube - z_cube
        let x_cube_frac = q_frac;
        let z_cube_frac = r_frac;
        let y_cube_frac = -x_cube_frac - z_cube_frac;

        let q_round = Math.round(x_cube_frac);
        let r_round = Math.round(z_cube_frac);
        let s_round = Math.round(y_cube_frac);

        const q_diff = Math.abs(q_round - x_cube_frac);
        const r_diff = Math.abs(r_round - z_cube_frac);
        const s_diff = Math.abs(s_round - y_cube_frac);

        if (q_diff > r_diff && q_diff > s_diff) {
            q_round = -r_round - s_round;
        } else if (r_diff > s_diff) {
            r_round = -q_round - s_round;
        } else {
            // s_round = -q_round - r_round; // Not needed, q and r are what we want
        }

        return { q: q_round, r: r_round };
    }

    // --- AI Player Logic ---
    function performAiMove() {
        if (currentPlayer !== 2 || !isAiPlayerActive || player2Hand.length === 0) {
            console.log("AI: Not my turn, not active, or no tiles left.");
            return;
        }

        gameMessageDisplay.textContent = "Player 2 (AI) is thinking...";

        // 1. Select a random tile from AI's hand
        const tileToPlay = player2Hand[Math.floor(Math.random() * player2Hand.length)];

        // 2. Randomly decide how many times to rotate the tile (0 to 5 times)
        const rotations = Math.floor(Math.random() * 6);
        for (let i = 0; i < rotations; i++) {
            tileToPlay.rotate();
        }
        console.log(`AI: Selected tile ${tileToPlay.id}, rotated ${rotations} times. Orientation: ${tileToPlay.orientation}`);

        // 3. Find all possible valid placements for this tile
        const possiblePlacements = [];
        // Iterate over a reasonable area of the board or use a more sophisticated approach
        // For simplicity, let's try placing around existing tiles or a predefined area.
        // A common strategy for finding placement spots is to look at empty cells adjacent to existing tiles.
        // If board is empty, place at a default starting position (e.g., 0,0)
        if (Object.keys(boardState).length === 0) {
            possiblePlacements.push({ x: 0, y: 0 }); // Center of the logical grid
        } else {
            for (const key in boardState) {
                const existingTile = boardState[key];
                const neighbors = getNeighbors(existingTile.x, existingTile.y);
                for (const neighborInfo of neighbors) {
                    const potentialPos = { x: neighborInfo.nx, y: neighborInfo.ny };
                    if (!boardState[`${potentialPos.x},${potentialPos.y}`]) { // If cell is empty
                        possiblePlacements.push(potentialPos);
                    }
                }
            }
        }

        // Filter for unique positions
        const uniquePlacements = possiblePlacements.filter((pos, index, self) =>
            index === self.findIndex((p) => p.x === pos.x && p.y === pos.y)
        );

        // Shuffle placements to make it random
        for (let i = uniquePlacements.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [uniquePlacements[i], uniquePlacements[j]] = [uniquePlacements[j], uniquePlacements[i]];
        }

        let placed = false;
        for (const pos of uniquePlacements) {
            if (isPlacementValid(tileToPlay, pos.x, pos.y, true)) { // true for isDragOver to suppress messages
                console.log(`AI: Attempting to place tile ${tileToPlay.id} at (${pos.x}, ${pos.y})`);
                if (placeTileOnBoard(tileToPlay, pos.x, pos.y)) {
                    player2Hand = player2Hand.filter(t => t.id !== tileToPlay.id);
                    displayPlayerHand(2, player2Hand, player2HandDisplay); // Update AI's hand display

                    console.log(`AI: Successfully placed tile ${tileToPlay.id} at (${pos.x}, ${pos.y})`);
                    gameMessageDisplay.textContent = `Player 2 (AI) placed tile ${tileToPlay.id}.`;

                    // After placing, check for surrounded tiles and proceed
                    checkForSurroundedTilesAndProceed(); // This will handle score, turn switch, or removal phase
                    placed = true;
                    break;
                }
            }
        }

        if (!placed) {
            // This scenario should be rare if there are any valid moves.
            // If AI cannot find a valid move with the selected tile and orientation,
            // it could try other tiles or orientations. For now, just pass the turn.
            console.log("AI: Could not find a valid placement for the selected tile and orientation. Passing turn.");
            gameMessageDisplay.textContent = "Player 2 (AI) could not make a move and passes.";
            // Ensure to switch turn even if AI passes.
            // checkForSurroundedTilesAndProceed would normally handle this, but if no placement, call directly.
            calculateScores(); // Update scores
            if (checkGameEnd()) {
                endGame();
            } else {
                switchTurn(); // Manually switch turn if AI couldn't place.
            }
        }
    }

    function performAiTileRemoval() {
        if (currentPlayer !== 2 || !isAiPlayerActive || !isRemovingTiles || currentSurroundedTilesForRemoval.length === 0) {
            console.log("AI: Not my turn for removal, not active, not in removal phase, or no tiles to remove.");
            return;
        }

        gameMessageDisplay.textContent = "Player 2 (AI) is choosing a tile to remove...";

        // AI randomly selects one of the highlighted tiles to remove.
        // In a more advanced AI, it might choose strategically.
        const tileToRemove = currentSurroundedTilesForRemoval[Math.floor(Math.random() * currentSurroundedTilesForRemoval.length)];

        console.log(`AI: Decided to remove tile ${tileToRemove.id} at (${tileToRemove.x}, ${tileToRemove.y})`);
        gameMessageDisplay.textContent = `Player 2 (AI) removes tile ${tileToRemove.id}.`;

        // Simulate a slight delay for the user to see the choice
        setTimeout(() => {
            removeTileFromBoardAndReturnToHand(tileToRemove);
            // removeTileFromBoardAndReturnToHand will call redrawBoard, check for more removals,
            // and then switch turn or end game as appropriate.
            // If more tiles need removal and it's still AI's turn, switchTurn will call performAiTileRemoval again.
        }, 1000); // Delay for AI "action"
    }

});
