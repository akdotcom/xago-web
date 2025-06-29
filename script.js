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
    // const currentPlayerDisplay = document.getElementById('current-player'); // Removed
    // const gameMessageDisplay = document.getElementById('game-message'); // Removed
    // const player1ScoreDisplay = document.getElementById('player1-score'); // Removed
    // const player2ScoreDisplay = document.getElementById('player2-score'); // Removed
    const playerScoresContainer = document.getElementById('player-scores'); // New container for scores
    let p1ScoreDisplayFloater, p2ScoreDisplayFloater; // Will be created dynamically

    const resetGameButton = document.getElementById('reset-game');
    const player1HandContainer = document.getElementById('player1-hand');
    const player2HandContainer = document.getElementById('player2-hand');
    const opponentTypeSelector = document.getElementById('opponent-type');

    // View management variables
    let currentOffsetX = 0;
    let currentOffsetY = 0;
    let currentZoomLevel = 1.0;
    let targetOffsetX = 0;
    let targetOffsetY = 0;
    let targetZoomLevel = 1.0;

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
    let opponentType = "human"; // Default to human opponent

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

        updateViewParameters(); // Update view after a tile is removed

        if (newSurroundedList.length > 0) {
            console.log("More surrounded tiles found:", newSurroundedList.map(t => t.id));
            // currentSurroundedTilesForRemoval is already updated globally before this block

            if (currentPlayer === 2 && (opponentType === 'random' || opponentType === 'greedy')) {
                // AI's turn and more tiles to remove, let AI continue removing
                // gameMessageDisplay.textContent = `Player 2 (AI - ${opponentType}) is removing more tiles...`; // Removed
                console.log(`Player 2 (AI - ${opponentType}) is removing more tiles...`);
                console.log("AI continues tile removal process. New list:", newSurroundedList.map(t => t.id));
                redrawBoardOnCanvas(); // Update highlights for the AI's next choice (visual feedback)
                // Using setTimeout to allow canvas to redraw before AI logic runs,
                // and to provide a brief visual pause if multiple tiles are removed sequentially.
                setTimeout(performAiTileRemoval, 250); // Short delay, performAiTileRemoval also has its own delay
            } else {
                // Human player's turn, or AI is human - prompt for click
                // gameMessageDisplay.textContent = `Player ${currentPlayer}, click on a highlighted tile to remove it.`; // Removed
                console.log(`Player ${currentPlayer}, click on a highlighted tile to remove it.`);
                redrawBoardOnCanvas(); // Redraw to update highlights for human player
            }
        } else {
            // No more tiles are surrounded, end the removal phase
            console.log("No more surrounded tiles. Ending removal phase.");
            isRemovingTiles = false;
            currentSurroundedTilesForRemoval = [];
            // gameMessageDisplay.textContent = "Tile removal complete. Finishing turn."; // Removed
            console.log("Tile removal complete. Finishing turn.");

            redrawBoardOnCanvas(); // Clear highlights from removed tiles before proceeding

            calculateScores();
            // The game end condition is now checked only at the beginning of a turn in switchTurn()
            switchTurn();
        }
        animateView(); // Call animation loop after parameters are updated
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
        // Placeholder for converting logical grid (tile.x, tile.y) to canvas pixels (cx, cy)
        // This needs a proper hexagonal grid coordinate system implementation later (Step 6).
        // Using a simple mapping for now for visualization.
        // currentOffsetX and currentOffsetY are used instead of CANVAS_OFFSET_X/Y
        // currentZoomLevel is used to scale tiles

        const scaledHexSideLength = BASE_HEX_SIDE_LENGTH * currentZoomLevel;

        for (const key in boardState) {
            const tile = boardState[key];
            if (tile.x === null || tile.y === null) continue;

            // Convert logical grid coordinates (tile.x, tile.y) to screen coordinates
            let screenX = currentOffsetX + scaledHexSideLength * (3/2 * tile.x);
            let screenY = currentOffsetY + scaledHexSideLength * (Math.sqrt(3)/2 * tile.x + Math.sqrt(3) * tile.y);

            drawHexTile(ctx, screenX, screenY, tile, currentZoomLevel); // Pass currentZoomLevel

            // Highlight if in removal mode and tile is one of the surrounded ones
            if (isRemovingTiles && currentSurroundedTilesForRemoval.some(st => st.id === tile.id)) {
                ctx.strokeStyle = 'red'; // Highlight color
                ctx.lineWidth = 3 * currentZoomLevel; // Scale line width
                ctx.beginPath();
                const vertices = [];
                for (let i = 0; i < 6; i++) {
                    const angle = Math.PI / 180 * (60 * i);
                    vertices.push({
                        x: screenX + scaledHexSideLength * Math.cos(angle),
                        y: screenY + scaledHexSideLength * Math.sin(angle)
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
    const BASE_HEX_SIDE_LENGTH = 40; // pixels - This is the reference size at zoom 1.0
    // const HEX_HEIGHT = Math.sqrt(3) * BASE_HEX_SIDE_LENGTH; // Dynamic
    // const HEX_WIDTH = 2 * BASE_HEX_SIDE_LENGTH; // Dynamic
    // const HEX_APOTHEM = HEX_HEIGHT / 2; // Dynamic

    // CANVAS_OFFSET_X and CANVAS_OFFSET_Y are now replaced by currentOffsetX/Y and targetOffsetX/Y
    // let initialCanvasOffsetX = (2 * BASE_HEX_SIDE_LENGTH) / 1.5;
    // let initialCanvasOffsetY = (Math.sqrt(3) * BASE_HEX_SIDE_LENGTH) / 1.5;


    // Function to draw a single hexagonal tile on the canvas
    // ctx: canvas rendering context
    // cx, cy: center coordinates of the hexagon on the canvas (screen coordinates)
    // tile: the HexTile object to draw
    // zoom: current zoom level to scale the tile
    function drawHexTile(ctx, cx, cy, tile, zoom = 1.0) { // Added zoom parameter, defaults to 1 for hand tiles
        const orientedEdges = tile.getOrientedEdges();
        const sideLength = BASE_HEX_SIDE_LENGTH * zoom;

        // Calculate hexagon vertices (flat-topped hexagon)
        const vertices = [];
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 180 * (60 * i);
            vertices.push({
                x: cx + sideLength * Math.cos(angle),
                y: cy + sideLength * Math.sin(angle)
            });
        }

        // Draw hexagon body
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < 6; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1 * zoom; // Scale line width
        ctx.stroke();

        const isAllBlank = orientedEdges.every(edge => edge === 0);

        if (isAllBlank) {
            const innerHexSideLength = sideLength / 6;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = Math.PI / 180 * (60 * i);
                const x = cx + innerHexSideLength * Math.cos(angle);
                const y = cy + innerHexSideLength * Math.sin(angle);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fillStyle = tile.getPlayerColor;
            ctx.fill();
        }

        for (let i = 0; i < 6; i++) {
            const edgeType = orientedEdges[i];
            const v1 = vertices[i];
            const v2 = vertices[(i + 1) % 6];

            const midX = (v1.x + v2.x) / 2;
            const midY = (v1.y + v2.y) / 2;

            let nx = v1.y - v2.y;
            let ny = v2.x - v1.x;
            const edgeLen = Math.sqrt(Math.pow(v2.x - v1.x, 2) + Math.pow(v2.y - v1.y, 2)); // Actual length of the hex side on screen

            // Normalize normal vector
            const normLen = Math.sqrt(nx * nx + ny * ny);
            if (normLen === 0) continue; // Should not happen for a polygon
            nx /= normLen;
            ny /= normLen;


            if (edgeType === 1) { // Triangle
                const triangleEdgeLength = sideLength * 0.8; // Scale triangle size with zoom
                const triangleHeight = (Math.sqrt(3) / 2) * triangleEdgeLength;

                const tipX = midX + nx * triangleHeight;
                const tipY = midY + ny * triangleHeight;

                const halfBase = triangleEdgeLength / 2;

                // Vector along the edge (from v1 to v2), normalized
                const edgeDirX = (v2.x - v1.x) / edgeLen;
                const edgeDirY = (v2.y - v1.y) / edgeLen;

                const base1X = midX - edgeDirX * halfBase;
                const base1Y = midY - edgeDirY * halfBase;
                const base2X = midX + edgeDirX * halfBase;
                const base2Y = midY + edgeDirY * halfBase;

                ctx.beginPath();
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(base1X, base1Y);
                ctx.lineTo(base2X, base2Y);
                ctx.closePath();
                ctx.fillStyle = tile.getPlayerColor;
                ctx.fill();

            } else { // Blank edge
                ctx.beginPath();
                ctx.moveTo(v1.x, v1.y); // Corrected from v2.y
                ctx.lineTo(v2.x, v2.y);
                ctx.strokeStyle = 'grey';
                ctx.lineWidth = 2 * zoom; // Scale line width
                ctx.stroke();
            }
        }
    }


    // --- Display Logic ---
    function displayPlayerHand(player, hand, handDisplayElement) {
        handDisplayElement.innerHTML = ''; // Clear previous tiles
        hand.forEach(tile => {
            const tileCanvas = document.createElement('canvas');
            // Use BASE_HEX_SIDE_LENGTH for hand tiles, assuming they don't zoom.
            // Or, if they should also scale with a global UI scale, that's a different feature.
            // For now, hand tiles are fixed size.
            const handTileSideLength = BASE_HEX_SIDE_LENGTH; // Or a smaller fixed size for hand tiles
            const handHexWidth = 2 * handTileSideLength;
            const handHexHeight = Math.sqrt(3) * handTileSideLength;

            tileCanvas.width = handHexWidth + 10;
            tileCanvas.height = handHexHeight + 10;
            tileCanvas.style.cursor = 'pointer';
            tileCanvas.style.margin = '5px';

            const tileCtx = tileCanvas.getContext('2d');
            const cx = tileCanvas.width / 2;
            const cy = tileCanvas.height / 2;

            // Draw hand tile without board zoom, passing zoom explicilty as 1.0 or not passing it if default is 1.0
            drawHexTile(tileCtx, cx, cy, tile, 1.0);

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
        // currentPlayerDisplay.textContent = `Current Player: Player ${currentPlayer}`; // Removed
        console.log(`Current Player: Player ${currentPlayer}`); // Log current player

        if (p1ScoreDisplayFloater && p2ScoreDisplayFloater) {
            p1ScoreDisplayFloater.textContent = player1Score;
            p1ScoreDisplayFloater.style.color = 'lightblue'; // Player 1 color

            p2ScoreDisplayFloater.textContent = player2Score;
            p2ScoreDisplayFloater.style.color = 'lightcoral'; // Player 2 color
        }
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

        // Initialize view parameters
        // For the very first tile, center on logical (0,0)
        // Calculate initial offset to center logical (0,0) on canvas.
        // screenX = currentOffsetX + scaledHexSideLength * (3/2 * q);
        // screenY = currentOffsetY + scaledHexSideLength * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
        // For q=0, r=0: screenX_center = currentOffsetX, screenY_center = currentOffsetY
        // So, currentOffsetX = gameCanvas.width / 2, currentOffsetY = gameCanvas.height / 2
        currentOffsetX = gameCanvas.width / 2;
        currentOffsetY = gameCanvas.height / 2;
        currentZoomLevel = 1.0; // Start with a default zoom
        targetOffsetX = currentOffsetX;
        targetOffsetY = currentOffsetY;
        targetZoomLevel = currentZoomLevel;


        initializeGameBoard(); // This clears the canvas and sets up background

        // Create score display elements if they don't exist
        if (!p1ScoreDisplayFloater) {
            p1ScoreDisplayFloater = document.createElement('span');
            p1ScoreDisplayFloater.id = 'p1-score-display'; // For potential specific styling
            playerScoresContainer.appendChild(p1ScoreDisplayFloater);
        }
        if (!p2ScoreDisplayFloater) {
            p2ScoreDisplayFloater = document.createElement('span');
            p2ScoreDisplayFloater.id = 'p2-score-display'; // For potential specific styling
            playerScoresContainer.appendChild(p2ScoreDisplayFloater);
        }

        displayPlayerHand(1, player1Hand, player1HandDisplay);
        displayPlayerHand(2, player2Hand, player2HandDisplay);

        updateGameInfo(); // This will now also call updateHandHighlights
        // gameMessageDisplay.textContent = "Player 1's turn. Select a tile and place it on the board."; // Removed
        console.log("Player 1's turn. Select a tile and place it on the board.");
        gameInitialized = true;
        console.log("Game initialized. Player 1 hand:", player1Hand, "Player 2 hand:", player2Hand);

        updateViewParameters(); // Calculate initial target view
        // Set current to target for the first draw and call animateView to start the loop if needed (e.g. if initial targets differ)
        currentOffsetX = targetOffsetX; // Start at target for first frame
        currentOffsetY = targetOffsetY;
        currentZoomLevel = targetZoomLevel;
        // redrawBoardOnCanvas(); // animateView will handle the first draw
        animateView(); // Start animation loop (will draw immediately if no animation needed)
    }

    // --- Player Actions ---
    let currentlySelectedTileCanvas = null; // Keep track of the currently selected canvas tile in hand

    function drawPlacementHighlight(q, r, color, isDeemphasized) {
        const scaledHexSideLength = BASE_HEX_SIDE_LENGTH * currentZoomLevel;
        // Convert logical grid (q,r) to screen coordinates for drawing highlight
        const screenX = currentOffsetX + scaledHexSideLength * (3/2 * q);
        const screenY = currentOffsetY + scaledHexSideLength * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 180 * (60 * i);
            const xPos = screenX + scaledHexSideLength * Math.cos(angle);
            const yPos = screenY + scaledHexSideLength * Math.sin(angle);
            if (i === 0) {
                ctx.moveTo(xPos, yPos);
            } else {
                ctx.lineTo(xPos, yPos);
            }
        }
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();

        // Add a border to the highlight, scaled by zoom
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 2 * currentZoomLevel; // Scale border width
        ctx.setLineDash([]);
        ctx.stroke();
    }


    function updatePlacementHighlights() {
        if (!selectedTile) {
            redrawBoardOnCanvas(); // Ensure board is clean if no tile is selected
            return;
        }

        redrawBoardOnCanvas(); // Redraw existing tiles first to clear old highlights and show current board state

        const tileToPlace = selectedTile.tile;
        const originalOrientation = tileToPlace.orientation;

        // Define the area to check for highlights.
        // For now, a simple square area. This could be optimized later.
        // e.g., iterate from -5 to 5 in q and r, or derive from BOARD_SIZE
        const checkRadius = Math.floor(BOARD_SIZE / 2) + 2; // A bit larger than half the board

        for (let q = -checkRadius; q <= checkRadius; q++) {
            for (let r = -checkRadius; r <= checkRadius; r++) {
                // Check if the cell is within cube constraints for a hexagonal area (optional, but good for large radii)
                // if (Math.abs(q + r) > checkRadius) continue; // This creates a diamond shape, for hex it's q+r+s=0, so s = -q-r

                const targetKey = `${q},${r}`;
                if (boardState[targetKey]) {
                    continue; // Cell is already occupied
                }

                // 1. Check with current orientation
                tileToPlace.orientation = originalOrientation; // Ensure current orientation
                if (isPlacementValid(tileToPlace, q, r, true)) { // true for isDragOver to suppress messages
                    drawPlacementHighlight(q, r, 'rgba(0, 255, 0, 0.7)', false); // Green, prominent
                } else {
                    // 2. Check with other orientations for de-emphasized highlight
                    let canBePlacedWithRotation = false;
                    for (let i = 0; i < 6; i++) {
                        if (i === originalOrientation) continue; // Already checked

                        tileToPlace.orientation = i;
                        if (isPlacementValid(tileToPlace, q, r, true)) {
                            canBePlacedWithRotation = true;
                            break;
                        }
                    }
                    if (canBePlacedWithRotation) {
                        drawPlacementHighlight(q, r, 'rgba(255, 255, 0, 0.5)', true); // Yellow, de-emphasized
                    }
                }
            }
        }
        // Restore the original orientation of the selected tile
        tileToPlace.orientation = originalOrientation;
    }

    function selectTileFromHand(tile, tileCanvasElement, playerId) {
        if (playerId !== currentPlayer) {
            // gameMessageDisplay.textContent = "It's not your turn!"; // Removed
            console.log("It's not your turn!");
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

            // gameMessageDisplay.textContent = `Tile rotated. Press 'r' or click tile to rotate again. Click board to place.`; // Removed
            console.log(`Tile rotated. Press 'r' or click tile to rotate again. Click board to place.`);
            updatePlacementHighlights(); // Update highlights after rotation
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

            // gameMessageDisplay.textContent = `Player ${currentPlayer} selected tile ${tile.id}. Press 'r' or click tile to rotate. Click on the board to place it.`; // Removed
            console.log(`Player ${currentPlayer} selected tile ${tile.id}. Press 'r' or click tile to rotate. Click on the board to place it.`);
            console.log("Selected tile:", selectedTile);
            updatePlacementHighlights(); // Update highlights on new selection
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
                // gameMessageDisplay.textContent = `Tile rotated. Press 'r' to rotate again. Click board to place.`; // Removed
                console.log(`Tile rotated. Press 'r' to rotate again. Click board to place.`);
                updatePlacementHighlights(); // Update highlights after rotation via key press
            }
        }
    });

    function handleCellClick(x, y) {
        console.log(`Cell clicked: x=${x}, y=${y}`);
        if (!selectedTile) {
            // gameMessageDisplay.textContent = "Please select a tile from your hand first."; // Removed
            console.log("Please select a tile from your hand first.");
            return;
        }
        if (selectedTile.originalPlayerId !== currentPlayer) {
            // gameMessageDisplay.textContent = "Error: Tile selection does not match current player."; // Removed
            console.log("Error: Tile selection does not match current player."); // Should not happen
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

            updatePlacementHighlights(); // Clear highlights as the tile is now placed and no longer "selected" for placement

            // Instead of directly calculating scores and switching turns,
            // call the new function to check for surrounded tiles.
            checkForSurroundedTilesAndProceed(); // This function might call redrawBoardOnCanvas internally
            updateViewParameters();
            animateView(); // Start animation after view parameters are updated

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
            if (!isDragOver) console.log("This cell is already occupied."); // gameMessageDisplay.textContent = "This cell is already occupied.";
            return false; // Cell occupied
        }

        const placedTilesCount = Object.keys(boardState).length;
        const orientedEdges = tile.getOrientedEdges(); // Use current orientation

        if (placedTilesCount === 0) {
            // First tile must be placed at (0,0)
            if (x === 0 && y === 0) {
                if (!isDragOver) console.log("First tile placed at (0,0)."); // gameMessageDisplay.textContent = "First tile placed at (0,0).";
                return true;
            } else {
                if (!isDragOver) console.log("The first tile must be placed at the center (0,0)."); // gameMessageDisplay.textContent = "The first tile must be placed at the center (0,0).";
                return false;
            }
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
                    if (!isDragOver) console.log(`Edge mismatch with neighbor at ${nx},${ny}. New: ${newTileEdgeType}, Neighbor: ${neighborEdgeType}`); // gameMessageDisplay.textContent = `Edge mismatch with neighbor at ${nx},${ny}. New: ${newTileEdgeType}, Neighbor: ${neighborEdgeType}`;
                    return false; // Edge types do not match
                }
            }
        }

        if (!touchesExistingTile) {
            if (!isDragOver) console.log("Tile must touch an existing tile."); // gameMessageDisplay.textContent = "Tile must touch an existing tile.";
            return false;
        }

        // New check: Ensure the target space (x,y) itself is not enclosed
        if (isSpaceEnclosed(x, y, boardState)) {
            if (!isDragOver) console.log("Cannot place tile in an enclosed space."); // gameMessageDisplay.textContent = "Cannot place tile in an enclosed space.";
            return false;
        }

        if (!isDragOver) console.log("Valid placement."); // gameMessageDisplay.textContent = "Valid placement.";
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

// Function to check if an empty space (q,r) is enclosed by tiles
function isSpaceEnclosed(q, r, currentBoardState) {
    const neighbors = getNeighbors(q, r); // Get all potential neighbor locations

    // If there are fewer than 6 neighbors (e.g., due to board edges if finite),
    // it cannot be enclosed in the context of this game's infinite logical grid.
    // However, our getNeighbors always returns 6 potential locations.
    // We need to check if all these 6 locations are *occupied* by tiles.

    for (const neighborInfo of neighbors) {
        const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
        if (!currentBoardState[neighborKey]) {
            // If any neighbor cell is empty, then the space (q,r) is not enclosed.
            return false;
        }
    }
    // If all 6 neighboring cells are occupied by tiles, the space (q,r) is enclosed.
    return true;
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
            isRemovingTiles = true;
            console.log("Tile removal phase. Surrounded tiles:", currentSurroundedTilesForRemoval.map(t => t.id));

            if (currentPlayer === 2 && (opponentType === 'random' || opponentType === 'greedy')) {
                // AI's turn and tiles are surrounded by its move, start AI removal process
                // gameMessageDisplay.textContent = `Player 2 (AI - ${opponentType}) is starting tile removal...`; // Removed
                console.log(`Player 2 (AI - ${opponentType}) is starting tile removal...`);
                redrawBoardOnCanvas(); // Show highlights
                // Short delay before AI starts, allowing UI to update and give a sense of action.
                setTimeout(performAiTileRemoval, 500); // Consistent with other AI initiation delays
            } else {
                // Human player's turn, or AI is human - prompt for click
                // gameMessageDisplay.textContent = `Player ${currentPlayer}, click on a highlighted tile to remove it.`; // Removed
                console.log(`Player ${currentPlayer}, click on a highlighted tile to remove it.`);
                redrawBoardOnCanvas(); // Redraw to show highlights
            }
        } else {
            // This case should ideally be handled by the calling function (checkForSurroundedTilesAndProceed)
            // but as a safeguard if processTileRemoval is ever called with an empty list:
            isRemovingTiles = false;
            currentSurroundedTilesForRemoval = [];
            console.log("No surrounded tiles to remove (handled in processTileRemoval, though checkForSurroundedTilesAndProceed should catch this).");
            // Normal turn progression
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
        updateGameInfo(); // Update score displays and current player display first

        // Check for game end condition *before* new turn actions (like AI move)
        // This implements the rule: "game ends when either player starts their turn with no tiles"
        if (checkGameEnd()) {
            endGame();
            return; // Do not proceed with the turn
        }

        // gameMessageDisplay.textContent = `Player ${currentPlayer}'s turn.`; // Removed
        console.log(`Player ${currentPlayer}'s turn.`);
        console.log(`Switched turn to Player ${currentPlayer}`);

        // Clear any existing tile selection and its highlights when turns switch
        if (selectedTile) {
            // Deselect tile visually if it's from a hand
            if (currentlySelectedTileCanvas) {
                currentlySelectedTileCanvas.style.border = 'none';
                currentlySelectedTileCanvas.style.boxShadow = 'none';
                currentlySelectedTileCanvas = null;
            }
            selectedTile = null;
            updatePlacementHighlights(); // This will clear the highlights by redrawing the board
        }

        // Check if AI needs to make a move or remove a tile
        if (currentPlayer === 2 && !isRemovingTiles && (opponentType === 'random' || opponentType === 'greedy')) {
            // gameMessageDisplay.textContent = "Player 2 (AI) is thinking..."; // Removed
            console.log("Player 2 (AI) is thinking...");
            setTimeout(performAiMove, 1000);
        } else if (currentPlayer === 2 && isRemovingTiles && (opponentType === 'random' || opponentType === 'greedy')) {
            // gameMessageDisplay.textContent = "Player 2 (AI) is choosing a tile to remove..."; // Removed
            console.log("Player 2 (AI) is choosing a tile to remove...");
            setTimeout(performAiTileRemoval, 1000);
        }
    }

    function checkGameEnd() {
        // Game ends if the current player starts their turn with no tiles left.
        if (currentPlayer === 1) {
            return player1Hand.length === 0;
        } else { // currentPlayer === 2
            return player2Hand.length === 0;
        }
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
        // gameMessageDisplay.textContent = `Game Over! ${winnerMessage}`; // Removed
        // currentPlayerDisplay.textContent = "Game Finished"; // Removed
        console.log(`Game Over! ${winnerMessage}`);
        console.log("Game ended. ", winnerMessage);
        // Disable further moves, or handle via selectedTile being null / hands empty
    }

    // Calculates scores based on a given board state
    function calculateScoresForBoard(currentBoardState) {
        let p1Score = 0;
        let p2Score = 0;

        for (const key in currentBoardState) {
            const tile = currentBoardState[key];
            // Ensure tile and its properties are valid, especially if board state is a copy
            if (!tile || typeof tile.getOrientedEdges !== 'function' || typeof tile.playerId === 'undefined') {
                console.warn("Skipping invalid tile in calculateScoresForBoard:", tile);
                continue;
            }
            const { x, y } = tile;
            const orientedEdges = tile.getOrientedEdges();
            const neighbors = getNeighbors(x, y);

            for (const neighborInfo of neighbors) {
                const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
                const neighborTile = currentBoardState[neighborKey];

                if (neighborTile && typeof neighborTile.getOrientedEdges === 'function' && neighborTile.playerId === tile.playerId) {
                    const edgeOnThisTile = orientedEdges[neighborInfo.edgeIndexOnNewTile];
                    const neighborOrientedEdges = neighborTile.getOrientedEdges();
                    const edgeOnNeighborTile = neighborOrientedEdges[neighborInfo.edgeIndexOnNeighborTile];

                    if (edgeOnThisTile === 1 && edgeOnNeighborTile === 1) {
                        if (tile.playerId === 1) {
                            p1Score++;
                        } else {
                            p2Score++;
                        }
                    }
                }
            }
        }
        p1Score /= 2;
        p2Score /= 2;
        return { player1Score: p1Score, player2Score: p2Score };
    }

    function calculateScores() {
        const scores = calculateScoresForBoard(boardState);
        player1Score = scores.player1Score;
        player2Score = scores.player2Score;

        updateGameInfo();
        console.log(`Scores calculated: P1: ${player1Score}, P2: ${player2Score}`);
    }


    // --- Event Listeners ---

function updateViewParameters() {
    const placedTiles = Object.values(boardState);
    const coordsForBoundingBox = new Set();

    if (placedTiles.length === 0) {
        // No tiles played, center on logical (0,0).
        // The view should show (0,0) and its immediate surrounding hexes for potential placement.
        targetOffsetX = gameCanvas.width / 2;
        targetOffsetY = gameCanvas.height / 2;
        targetZoomLevel = 0.8; // Start with a sensible zoom for an empty board.

        // Add (0,0) and its direct neighbors to the bounding box calculation.
        coordsForBoundingBox.add("0,0");
        getNeighbors(0,0).forEach(neighbor => {
            coordsForBoundingBox.add(`${neighbor.nx},${neighbor.ny}`);
        });
        // Add one more layer around these initial spots to ensure they are not cut off.
        const initialRelevantCoords = [...coordsForBoundingBox];
        initialRelevantCoords.forEach(coordStr => {
            const [q,r] = coordStr.split(',').map(Number);
            getNeighbors(q,r).forEach(nextNeighbor => {
                coordsForBoundingBox.add(`${nextNeighbor.nx},${nextNeighbor.ny}`);
            });
        });

    } else {
        // Tiles are on the board.
        // 1. Add all placed tiles to the set for bounding box calculation.
        placedTiles.forEach(tile => {
            coordsForBoundingBox.add(`${tile.x},${tile.y}`);
        });

        // 2. Add a one-hex border *only around placed tiles*.
        // This ensures the edges of the outermost placed tiles are fully visible
        // and provides a small margin for the viewport.
        const currentPlacedTileCoords = [...coordsForBoundingBox]; // Snapshot of only placed tiles
        currentPlacedTileCoords.forEach(coordStr => {
            const [q, r] = coordStr.split(',').map(Number);
            getNeighbors(q, r).forEach(outerNeighbor => {
                // We add these neighbors to the set that defines the bounding box
                // for zoom and centering. This provides a small margin around played tiles.
                coordsForBoundingBox.add(`${outerNeighbor.nx},${outerNeighbor.ny}`);
            });
        });
        // NOTE: Logic for adding all `potentialPlacementSpots` to `coordsForBoundingBox`
        // (which previously influenced zoom and centering) has been removed.
        // Potential placement spots will still be drawn if they fall within the viewport
        // determined by the placed tiles and their immediate border.
    }

    // Fallback if, for some reason (e.g., error in logic above), coordsForBoundingBox is empty.
    // This ensures min/max calculations don't fail with Infinity.
    if (coordsForBoundingBox.size === 0 && placedTiles.length > 0) {
        // This case should ideally not be reached if placedTiles is not empty.
        // As a safety, re-add placed tiles.
        placedTiles.forEach(tile => {
            coordsForBoundingBox.add(`${tile.x},${tile.y}`);
        });
         // If still empty (e.g. tiles have null x/y), default to 0,0
        if (coordsForBoundingBox.size === 0) {
            coordsForBoundingBox.add("0,0");
        }
    } else if (coordsForBoundingBox.size === 0 && placedTiles.length === 0) {
        // This is handled by the initial empty board logic, but as a safeguard here:
        coordsForBoundingBox.add("0,0");
        getNeighbors(0,0).forEach(neighbor => { // Add a bit more context for empty board default
            coordsForBoundingBox.add(`${neighbor.nx},${neighbor.ny}`);
        });
    }


    let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
    coordsForBoundingBox.forEach(coordStr => {
        const [q, r] = coordStr.split(',').map(Number);
        minQ = Math.min(minQ, q);
        maxQ = Math.max(maxQ, q);
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
    });

    const boundingBoxCenterQ = minQ + (maxQ - minQ) / 2;
    const boundingBoxCenterR = minR + (maxR - minR) / 2;

    let maxPixelX = -Infinity, minPixelX = Infinity, maxPixelY = -Infinity, minPixelY = Infinity;
    coordsForBoundingBox.forEach(coordStr => {
        const [q, r] = coordStr.split(',').map(Number);
        const cellCX = BASE_HEX_SIDE_LENGTH * (3/2 * q);
        const cellCY = BASE_HEX_SIDE_LENGTH * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
        const hexScreenWidth = BASE_HEX_SIDE_LENGTH * 2;
        const hexScreenHeight = BASE_HEX_SIDE_LENGTH * Math.sqrt(3);

        minPixelX = Math.min(minPixelX, cellCX - hexScreenWidth / 2);
        maxPixelX = Math.max(maxPixelX, cellCX + hexScreenWidth / 2);
        minPixelY = Math.min(minPixelY, cellCY - hexScreenHeight / 2);
        maxPixelY = Math.max(maxPixelY, cellCY + hexScreenHeight / 2);
    });

    const totalPixelWidthNeeded = maxPixelX - minPixelX;
    const totalPixelHeightNeeded = maxPixelY - minPixelY;

    const padding = 0.95; // Reduced padding for a tighter zoom (was 0.90)
    let zoomX = 1, zoomY = 1;

    if (totalPixelWidthNeeded > 0) {
      zoomX = (gameCanvas.width * padding) / totalPixelWidthNeeded;
    }
    if (totalPixelHeightNeeded > 0) {
      zoomY = (gameCanvas.height * padding) / totalPixelHeightNeeded;
    }

    targetZoomLevel = Math.min(zoomX, zoomY);
    // Max zoom: prevent zooming in too much on a single tile or small cluster.
    // Min zoom: prevent zooming out too far on a very spread-out board.
    targetZoomLevel = Math.min(targetZoomLevel, 1.8); // Increased max zoom slightly
    targetZoomLevel = Math.max(targetZoomLevel, 0.15); // Decreased min zoom slightly

    // If board was initially empty, and the default calculation leads to a very different zoom,
    // stick to a reasonable default. The initial 0.8 might be overridden by the calculation,
    // so this ensures a good starting view.
    if (placedTiles.length === 0) {
        targetZoomLevel = Math.min(targetZoomLevel, 0.8); // Ensure initial zoom is not too large
    }

    // const scaledSideLength = BASE_HEX_SIDE_LENGTH * targetZoomLevel; // Kept for reference, but not used in the new offset calculation directly here.
    // targetOffsetX = gameCanvas.width / 2 - scaledSideLength * (3/2 * boundingBoxCenterQ); // Old centering logic
    // targetOffsetY = gameCanvas.height / 2 - scaledSideLength * (Math.sqrt(3)/2 * boundingBoxCenterQ + Math.sqrt(3) * boundingBoxCenterR); // Old centering logic

    // Calculate the width and height of the content *at the target zoom level*
    const contentPixelWidthAtTargetZoom = totalPixelWidthNeeded * targetZoomLevel;
    const contentPixelHeightAtTargetZoom = totalPixelHeightNeeded * targetZoomLevel;

    // New offset calculation to center the pixel bounding box
    // This ensures that the actual rendered pixel content is centered.
    // minPixelX and minPixelY are the coordinates of the top-left of the content's bounding box *at zoom 1.0*.
    // We need to account for the current targetZoomLevel.
    targetOffsetX = (gameCanvas.width - contentPixelWidthAtTargetZoom) / 2 - (minPixelX * targetZoomLevel);
    targetOffsetY = (gameCanvas.height - contentPixelHeightAtTargetZoom) / 2 - (minPixelY * targetZoomLevel);
}

let animationFrameId = null; // To keep track of the animation frame

function animateView() {
    // Stop any previous animation frame
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    const animationSpeed = 0.1; // Adjust for faster/slower animation
    let needsRedraw = false;

    // Interpolate offset
    if (Math.abs(targetOffsetX - currentOffsetX) > 0.1) {
        currentOffsetX += (targetOffsetX - currentOffsetX) * animationSpeed;
        needsRedraw = true;
    } else {
        currentOffsetX = targetOffsetX;
    }

    if (Math.abs(targetOffsetY - currentOffsetY) > 0.1) {
        currentOffsetY += (targetOffsetY - currentOffsetY) * animationSpeed;
        needsRedraw = true;
    } else {
        currentOffsetY = targetOffsetY;
    }

    // Interpolate zoom
    if (Math.abs(targetZoomLevel - currentZoomLevel) > 0.001) { // Smaller threshold for zoom
        currentZoomLevel += (targetZoomLevel - currentZoomLevel) * animationSpeed;
        needsRedraw = true;
    } else {
        currentZoomLevel = targetZoomLevel;
    }

    if (needsRedraw) {
        redrawBoardOnCanvas(); // Redraw with new current values
        if (selectedTile) { // If a tile is selected, highlights also need to be updated during animation
            updatePlacementHighlights();
        }
        animationFrameId = requestAnimationFrame(animateView); // Continue animation
    } else {
        animationFrameId = null; // Animation finished
        // Final redraw to ensure exact target values are rendered if needed,
        // though redrawBoardOnCanvas() already uses current values which should be target now.
        // Consider if a final highlight update is needed here too.
        if (selectedTile) updatePlacementHighlights(); // Refresh highlights at final position
        else redrawBoardOnCanvas(); // Ensure final state is drawn clean
    }
}


    resetGameButton.addEventListener('click', () => {
        console.log("Reset game button clicked.");
        // initializeGame() already handles clearing the canvas and resetting state.
        initializeGame();
    });

    // --- Start the game ---
    initializeGame();

    // --- Opponent Type Selector Event Listener ---
    opponentTypeSelector.addEventListener('change', (event) => {
        opponentType = event.target.value;
        console.log(`Opponent type changed to: ${opponentType}`);

        // If it's Player 2's turn and a CPU opponent is selected, and not in removal phase,
        // let the AI make a move.
        if (currentPlayer === 2 && (opponentType === 'random' || opponentType === 'greedy') && !isRemovingTiles) {
            // Add a small delay to allow any UI updates to settle and prevent rapid consecutive moves
            // if the change happens very quickly after a human P2 move might have been expected.
            // gameMessageDisplay.textContent = "Player 2 (AI) is thinking..."; // Update message immediately // Removed
            console.log("Player 2 (AI) is thinking... (opponent type changed)");
            setTimeout(performAiMove, 500);
        }
        // If it's Player 2's turn, in removal phase, and a CPU opponent is selected
        else if (currentPlayer === 2 && (opponentType === 'random' || opponentType === 'greedy') && isRemovingTiles) {
            // gameMessageDisplay.textContent = "Player 2 (AI) is choosing a tile to remove..."; // Removed
            console.log("Player 2 (AI) is choosing a tile to remove... (opponent type changed)");
            setTimeout(performAiTileRemoval, 500);
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
                // gameMessageDisplay.textContent = "Invalid selection. Click on a highlighted (surrounded) tile to remove it."; // Removed
                console.log("Invalid selection. Click on a highlighted (surrounded) tile to remove it.");
            }
        } else {
            // --- Handle Tile Placement Click (existing logic) ---
            if (!selectedTile) {
                // gameMessageDisplay.textContent = "Please select a tile from your hand first."; // Removed
                console.log("Please select a tile from your hand first.");
                return;
            }
            if (selectedTile.originalPlayerId !== currentPlayer) {
                // gameMessageDisplay.textContent = "Error: Tile selection does not match current player (should not happen)."; // Removed
                console.log("Error: Tile selection does not match current player (should not happen).");
                return;
            }
            // For now, directly use q,r as x,y for game logic.
            // This assumes our game logic (isPlacementValid, getNeighbors) will also use q,r.
            handleCellClick(q, r);
        }
    });

    // Converts pixel coordinates on canvas to logical hex grid coordinates (q, r - axial)
    function pixelToHexGrid(pixelX, pixelY) {
        // Inverse of the drawing formula, taking into account currentOffset and currentZoomLevel
        // screenX = currentOffsetX + (BASE_HEX_SIDE_LENGTH * currentZoomLevel) * (3/2 * q)
        // screenY = currentOffsetY + (BASE_HEX_SIDE_LENGTH * currentZoomLevel) * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r)

        const scaledHexSideLength = BASE_HEX_SIDE_LENGTH * currentZoomLevel;
        if (scaledHexSideLength === 0) return { q:0, r:0 }; // Avoid division by zero if zoom is 0

        // Adjust pixel coordinates by the current offset
        const x = pixelX - currentOffsetX;
        const y = pixelY - currentOffsetY;

        // Convert to fractional axial coordinates (q_frac, r_frac)
        // q_frac = (2/3 * x_adjusted_for_offset_and_zoom)
        // r_frac = (-1/3 * x_adjusted_for_offset_and_zoom + sqrt(3)/3 * y_adjusted_for_offset_and_zoom)
        // where x_adj = x / scaledHexSideLength and y_adj = y / scaledHexSideLength

        let q_frac = (2/3 * x) / scaledHexSideLength;
        let r_frac = (-1/3 * x + Math.sqrt(3)/3 * y) / scaledHexSideLength;

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

    // Helper function to deep copy board state and tile objects
    function deepCopyBoardState(originalBoardState) {
        const newBoardState = {};
        for (const key in originalBoardState) {
            const tile = originalBoardState[key];
            // Create a new HexTile instance to ensure methods are available if needed,
            // though for scoring, only data properties are strictly necessary.
            // The HexTile constructor copies the edges array.
            const newTile = new HexTile(tile.id, tile.playerId, tile.edges);
            newTile.orientation = tile.orientation;
            newTile.x = tile.x;
            newTile.y = tile.y;
            newBoardState[key] = newTile;
        }
        return newBoardState;
    }


    function performAiMove() {
        if (currentPlayer !== 2 || player2Hand.length === 0) {
            console.log("AI: Not my turn or no tiles left.");
            return;
        }
        if (opponentType === 'human') {
            console.log("AI: Opponent is human, AI will not move.");
            return;
        }

        // gameMessageDisplay.textContent = "Player 2 (AI) is thinking..."; // Removed
        console.log("Player 2 (AI) is thinking... (performAiMove)");
        let bestMove = null;

        if (opponentType === 'random') {
            // --- Random AI Logic ---
            console.log("AI: Playing Randomly");
            const tileToPlay = player2Hand[Math.floor(Math.random() * player2Hand.length)];
            const originalOrientation = tileToPlay.orientation; // Save original orientation

            const rotations = Math.floor(Math.random() * 6);
            for (let i = 0; i < rotations; i++) {
                tileToPlay.rotate();
            }
            console.log(`AI (Random): Selected tile ${tileToPlay.id}, rotated to orientation ${tileToPlay.orientation}`);

            const possiblePlacements = [];
            if (Object.keys(boardState).length === 0) {
                possiblePlacements.push({ x: 0, y: 0, tile: tileToPlay, orientation: tileToPlay.orientation });
            } else {
                for (const key in boardState) {
                    const existingTile = boardState[key];
                    const neighbors = getNeighbors(existingTile.x, existingTile.y);
                    for (const neighborInfo of neighbors) {
                        const potentialPos = { x: neighborInfo.nx, y: neighborInfo.ny };
                        if (!boardState[`${potentialPos.x},${potentialPos.y}`]) {
                            if (isPlacementValid(tileToPlay, potentialPos.x, potentialPos.y, true)) {
                                possiblePlacements.push({ x: potentialPos.x, y: potentialPos.y, tile: tileToPlay, orientation: tileToPlay.orientation });
                            }
                        }
                    }
                }
            }

            const uniquePlacements = possiblePlacements.filter((pos, index, self) =>
                index === self.findIndex((p) => p.x === pos.x && p.y === pos.y)
            );

            if (uniquePlacements.length > 0) {
                bestMove = uniquePlacements[Math.floor(Math.random() * uniquePlacements.length)];
            }
            tileToPlay.orientation = originalOrientation; // Restore original orientation for the actual tile in hand

        } else if (opponentType === 'greedy') {
            // --- Greedy AI Logic ---
            console.log("AI: Playing Greedily");
            let bestScoreDiff = -Infinity;
            let bestMoves = []; // Stores all moves with the best score

            for (const tile of player2Hand) {
                const originalOrientation = tile.orientation; // Save to restore later
                for (let o = 0; o < 6; o++) {
                    tile.orientation = o;

                    const placementSpots = [];
                    if (Object.keys(boardState).length === 0) {
                        placementSpots.push({ x: 0, y: 0 });
                    } else {
                        // Consider empty spots adjacent to existing tiles
                        const checkedSpots = new Set();
                        for (const key in boardState) {
                            const existingTile = boardState[key];
                            const neighbors = getNeighbors(existingTile.x, existingTile.y);
                            for (const neighborInfo of neighbors) {
                                const spotKey = `${neighborInfo.nx},${neighborInfo.ny}`;
                                if (!boardState[spotKey] && !checkedSpots.has(spotKey)) {
                                    placementSpots.push({ x: neighborInfo.nx, y: neighborInfo.ny });
                                    checkedSpots.add(spotKey);
                                }
                            }
                        }
                         // Also consider a broader scan for isolated valid placements if the board is sparse
                        if (placementSpots.length === 0 && Object.keys(boardState).length < 5) { // Heuristic for sparse board
                            const scanRadius = 3; // Small radius scan
                            for (let q = -scanRadius; q <= scanRadius; q++) {
                                for (let r = -scanRadius; r <= scanRadius; r++) {
                                     if (Math.abs(q + r) > scanRadius) continue;
                                     const spotKey = `${q},${r}`;
                                     if(!boardState[spotKey] && !checkedSpots.has(spotKey)){
                                         placementSpots.push({ x: q, y: r });
                                         checkedSpots.add(spotKey);
                                     }
                                }
                            }
                        }
                    }


                    for (const pos of placementSpots) {
                        if (isPlacementValid(tile, pos.x, pos.y, true)) { // isDragOver = true to suppress messages
                            const tempBoardState = deepCopyBoardState(boardState);

                            // Create a temporary tile instance for simulation to avoid issues with the actual hand tile instance
                            const simTile = new HexTile(tile.id, tile.playerId, tile.edges);
                            simTile.orientation = tile.orientation;
                            simTile.x = pos.x;
                            simTile.y = pos.y;
                            tempBoardState[`${pos.x},${pos.y}`] = simTile;

                            // --- Simulate tile removal after placement ---
                            let boardAfterSimulatedRemovals = deepCopyBoardState(tempBoardState); // Operate on a copy for removal simulation
                            let simulatedSurroundedTiles = getSurroundedTiles(boardAfterSimulatedRemovals);

                            while (simulatedSurroundedTiles.length > 0) {
                                let tileToSimulateRemove = null;
                                // Prioritize opponent's (Player 1's) tiles for removal
                                const opponentSimTiles = simulatedSurroundedTiles.filter(t => t.playerId === 1);
                                if (opponentSimTiles.length > 0) {
                                    tileToSimulateRemove = opponentSimTiles[0]; // Simple: remove the first one found
                                } else {
                                    // If no opponent tiles, but own (Player 2's) tiles are surrounded, remove one
                                    const ownSimTiles = simulatedSurroundedTiles.filter(t => t.playerId === 2);
                                    if (ownSimTiles.length > 0) {
                                        tileToSimulateRemove = ownSimTiles[0]; // Simple: remove the first one found
                                    }
                                }

                                if (tileToSimulateRemove) {
                                    delete boardAfterSimulatedRemovals[`${tileToSimulateRemove.x},${tileToSimulateRemove.y}`];
                                    // Re-check for surrounded tiles in the new simulated state
                                    simulatedSurroundedTiles = getSurroundedTiles(boardAfterSimulatedRemovals);
                                } else {
                                    break; // No more tiles can be chosen for removal (e.g., all surrounded belong to a third player, or logic error)
                                }
                            }
                            // --- End of simulated tile removal ---

                            const scores = calculateScoresForBoard(boardAfterSimulatedRemovals); // Score based on post-removal state
                            const scoreDiff = scores.player2Score - scores.player1Score;

                            if (scoreDiff > bestScoreDiff) {
                                bestScoreDiff = scoreDiff;
                                bestMoves = [{ tile: tile, orientation: tile.orientation, x: pos.x, y: pos.y, score: scoreDiff }];
                            } else if (scoreDiff === bestScoreDiff) {
                                bestMoves.push({ tile: tile, orientation: tile.orientation, x: pos.x, y: pos.y, score: scoreDiff });
                            }
                        }
                    }
                }
                tile.orientation = originalOrientation; // Restore original orientation for the tile in hand
            }

            if (bestMoves.length > 0) {
                bestMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
                console.log(`AI (Greedy): Randomly selected one of ${bestMoves.length} best moves. Tile ${bestMove.tile.id}, Orient ${bestMove.orientation}, Pos (${bestMove.x},${bestMove.y}), ScoreDiff ${bestMove.score}`);
            } else {
                bestMove = null; // Explicitly set to null if no moves were found
                 console.log(`AI (Greedy): No valid moves found.`);
            }
        } else if (opponentType === 'greedy2') {
            console.log("AI: Playing Greedily with Lookahead (Greedy 2)");
            // Placeholder for Greedy 2 logic. This will call findBestMoveMinimax.
            // The actual implementation of findBestMoveMinimax will be complex.
            // For now, let's ensure the structure is in place.
            bestMove = findBestMoveMinimax(boardState, player2Hand, player1Hand, 2, 1, 1); // board, aiHand, opponentHand, aiPlayerId, opponentPlayerId, depth
            if(bestMove && bestMove.tile) {
                console.log(`AI (Greedy 2): Best move found by minimax - Tile ${bestMove.tile.id}, Orient ${bestMove.orientation}, Pos (${bestMove.x},${bestMove.y}), Score ${bestMove.score}`);
            } else if (bestMove) {
                // bestMove object exists, but it doesn't have a .tile (e.g. returned from minimax base case as {score: ..., tile: null})
                console.log(`AI (Greedy 2): Minimax evaluation completed but no specific tile move selected (e.g. depth 0 or no moves). Score: ${bestMove.score}`);
            } else {
                // bestMove itself is null or undefined (should not happen if findBestMoveMinimax always returns an object)
                console.log(`AI (Greedy 2): Minimax did not return a best move object.`);
            }
        }


        if (bestMove && bestMove.tile) { // Check if a valid tile is part of the best move
            const tileToPlace = player2Hand.find(t => t.id === bestMove.tile.id);
            if (!tileToPlace) { // This case should be rare if bestMove.tile.id is valid and from player2Hand
                console.error("AI Error: Best move tile (ID: " + (bestMove.tile ? bestMove.tile.id : 'N/A') + ") not found in player 2 hand! This indicates a desync or logic error in minimax hand simulation.");
                switchTurn(); // Pass turn
                return;
            }
            tileToPlace.orientation = bestMove.orientation; // Set the chosen orientation

            console.log(`AI (${opponentType}): Attempting to place tile ${tileToPlace.id} at (${bestMove.x}, ${bestMove.y}) with orientation ${bestMove.orientation}`);
            if (placeTileOnBoard(tileToPlace, bestMove.x, bestMove.y)) {
                player2Hand = player2Hand.filter(t => t.id !== tileToPlace.id);
                displayPlayerHand(2, player2Hand, player2HandDisplay);

                console.log(`AI (${opponentType}): Successfully placed tile ${tileToPlace.id}.`);
                // gameMessageDisplay.textContent = `Player 2 (AI) placed tile.`; // Removed
                console.log(`Player 2 (AI) placed tile.`);
                checkForSurroundedTilesAndProceed();
                // Ensure view updates after AI move and any subsequent actions (like tile removal) are complete.
                updateViewParameters();
                animateView();
            } else {
                // This should not happen if isPlacementValid was checked correctly during simulation
                console.error(`AI (${opponentType}): Failed to place tile ${tileToPlace.id} despite it being considered a valid move.`);
                // gameMessageDisplay.textContent = `Player 2 (AI) failed to make a move.`; // Removed
                console.log(`Player 2 (AI) failed to make a move.`);
                switchTurn(); // Pass turn
            }
        } else {
            console.log(`AI (${opponentType}): Could not find any valid move. Passing turn.`);
            // gameMessageDisplay.textContent = "Player 2 (AI) passes."; // Removed
            console.log("Player 2 (AI) passes.");
            calculateScores(); // Calculate scores in case it's relevant for display, though game end is deferred
            // The game end condition is now checked only at the beginning of a turn in switchTurn()
            switchTurn();
        }
    }

    function performAiTileRemoval() {
        if (currentPlayer !== 2 || !isRemovingTiles || currentSurroundedTilesForRemoval.length === 0) {
            console.log("AI: Not my turn for removal, not in removal phase, or no tiles to remove.");
            return;
        }
        if (opponentType === 'human') { // Make sure AI doesn't act if opponent switched to human mid-removal
            console.log("AI: Opponent is human, AI will not remove tile.");
            return;
        }

        // gameMessageDisplay.textContent = `Player 2 (AI - ${opponentType}) is choosing a tile to remove...`; // Removed
        console.log(`Player 2 (AI - ${opponentType}) is choosing a tile to remove... (performAiTileRemoval)`);
        let tileToRemove = null;

        if (opponentType === 'random') {
            console.log("AI (Random): Choosing random tile to remove.");
            const opponentTiles = currentSurroundedTilesForRemoval.filter(t => t.playerId !== currentPlayer); // Player 1's tiles for Player 2 AI
            if (opponentTiles.length > 0) {
                tileToRemove = opponentTiles[Math.floor(Math.random() * opponentTiles.length)];
                console.log(`AI (Random): Selected opponent's tile ${tileToRemove.id} to remove.`);
            } else if (currentSurroundedTilesForRemoval.length > 0) { // Only own tiles are surrounded
                tileToRemove = currentSurroundedTilesForRemoval[Math.floor(Math.random() * currentSurroundedTilesForRemoval.length)];
                console.log(`AI (Random): No opponent tiles to remove. Selected own tile ${tileToRemove.id} to remove.`);
            }
        } else if (opponentType === 'greedy') {
            console.log("AI (Greedy): Choosing strategic tile to remove.");
            const opponentTiles = currentSurroundedTilesForRemoval.filter(t => t.playerId !== currentPlayer); // Player 1's tiles for Player 2 AI
            if (opponentTiles.length > 0) {
                // For now, "greedy" still picks the first one. A more advanced greedy
                // might score which opponent tile is most beneficial to remove.
                tileToRemove = opponentTiles[0];
                console.log(`AI (Greedy): Prioritizing removal of opponent's tile: ${tileToRemove.id}`);
            } else if (currentSurroundedTilesForRemoval.length > 0) { // Only own tiles are surrounded
                tileToRemove = currentSurroundedTilesForRemoval[0];
                console.log(`AI (Greedy): No opponent tiles to remove. Removing own tile: ${tileToRemove.id}`);
            }
        } else if (opponentType === 'greedy2') {
            console.log("AI (Greedy 2): Choosing strategic tile to remove.");
            let bestChoice = null;
            let bestScore = -Infinity;

            const opponentTiles = currentSurroundedTilesForRemoval.filter(t => t.playerId !== currentPlayer);
            const ownTiles = currentSurroundedTilesForRemoval.filter(t => t.playerId === currentPlayer);

            if (opponentTiles.length > 0) {
                console.log("AI (Greedy 2): Evaluating removal of opponent's tiles.");
                for (const oppTile of opponentTiles) {
                    const tempBoard = deepCopyBoardState(boardState);
                    delete tempBoard[`${oppTile.x},${oppTile.y}`]; // Simulate removal
                    const score = evaluateBoard(tempBoard, currentPlayer);
                    if (score > bestScore) {
                        bestScore = score;
                        bestChoice = oppTile;
                    }
                }
                tileToRemove = bestChoice;
                if (tileToRemove) console.log(`AI (Greedy 2): Chose opponent's tile ${tileToRemove.id} for removal, score: ${bestScore}`);
            } else if (ownTiles.length > 0) {
                console.log("AI (Greedy 2): Evaluating removal of own tiles (to minimize damage).");
                 // If removing own tile, we want the one whose removal results in the least bad score (highest score)
                for (const ownTile of ownTiles) {
                    const tempBoard = deepCopyBoardState(boardState);
                    delete tempBoard[`${ownTile.x},${ownTile.y}`]; // Simulate removal
                    const score = evaluateBoard(tempBoard, currentPlayer);
                     if (score > bestScore) { // Still maximizing our score
                        bestScore = score;
                        bestChoice = ownTile;
                    }
                }
                tileToRemove = bestChoice;
                 if (tileToRemove) console.log(`AI (Greedy 2): Chose own tile ${tileToRemove.id} for removal, score: ${bestScore}`);
            }
        }


        if (tileToRemove) {
            console.log(`AI (${opponentType}): Decided to remove tile ${tileToRemove.id} at (${tileToRemove.x}, ${tileToRemove.y})`);
            // gameMessageDisplay.textContent = `Player 2 (AI - ${opponentType}) removes tile ${tileToRemove.id}.`; // Removed
            console.log(`Player 2 (AI - ${opponentType}) removes tile ${tileToRemove.id}.`);

            // Simulate a slight delay for the user to see the choice
            // The iterative auto-removal will be handled by removeTileFromBoardAndReturnToHand re-triggering AI removal.
            setTimeout(() => {
                removeTileFromBoardAndReturnToHand(tileToRemove);
            }, 750); // Slightly reduced delay for potentially faster auto-removal sequence
        } else {
            // This case implies currentSurroundedTilesForRemoval was empty or some other logic error.
            // The initial check in the function should prevent currentSurroundedTilesForRemoval being empty.
            console.error("AI: Error in tile removal logic - no tile selected for removal. currentSurroundedTilesForRemoval:", currentSurroundedTilesForRemoval);
            // As a fallback, to prevent getting stuck, exit removal mode and proceed with game flow.
            isRemovingTiles = false;
            currentSurroundedTilesForRemoval = [];
            // gameMessageDisplay.textContent = "AI encountered an issue during tile removal. Proceeding..."; // Removed
            console.log("AI encountered an issue during tile removal. Proceeding...");
            redrawBoardOnCanvas(); // Clear highlights
            calculateScores();
            // The game end condition is now checked only at the beginning of a turn in switchTurn()
            switchTurn();
        }
    }

    // --- Minimax AI Helper Functions ---

    // getAllPossibleMoves(boardState, playerHand, playerId)
    // Returns an array of objects, where each object is:
    // { tile: HexTile, orientation: number, x: number, y: number }
    function getAllPossibleMoves(currentBoardState, hand, playerId) {
        const possibleMoves = [];
        const initialBoardIsEmpty = Object.keys(currentBoardState).length === 0;

        for (const tile of hand) {
            const originalOrientation = tile.orientation; // Save to restore
            for (let o = 0; o < 6; o++) {
                tile.orientation = o;

                if (initialBoardIsEmpty) {
                    // First move must be at (0,0)
                    if (isPlacementValid(tile, 0, 0, true)) { // true for isDragOver to suppress messages
                        possibleMoves.push({ tile: tile, orientation: o, x: 0, y: 0, playerId: playerId });
                    }
                } else {
                    const placementSpots = new Set(); // Use a Set to avoid duplicate spot checks for different tiles
                    for (const key in currentBoardState) {
                        const existingTile = currentBoardState[key];
                        const neighbors = getNeighbors(existingTile.x, existingTile.y);
                        for (const neighborInfo of neighbors) {
                            const spotKey = `${neighborInfo.nx},${neighborInfo.ny}`;
                            if (!currentBoardState[spotKey]) {
                                placementSpots.add(spotKey);
                            }
                        }
                    }
                    // Add broader scan for sparse boards if no direct adjacent spots found
                    // This part can be refined or made more efficient if needed.
                    if (placementSpots.size === 0 && Object.keys(currentBoardState).length < 5) {
                        const scanRadius = 3;
                        for (let q = -scanRadius; q <= scanRadius; q++) {
                            for (let r = -scanRadius; r <= scanRadius; r++) {
                                if (Math.abs(q + r) > scanRadius) continue;
                                const spotKey = `${q},${r}`;
                                if (!currentBoardState[spotKey]) {
                                    placementSpots.add(spotKey);
                                }
                            }
                        }
                    }


                    for (const spotKey of placementSpots) {
                        const [x, y] = spotKey.split(',').map(Number);
                        if (isPlacementValid(tile, x, y, true)) {
                            possibleMoves.push({ tile: tile, orientation: o, x: x, y: y, playerId: playerId });
                        }
                    }
                }
            }
            tile.orientation = originalOrientation; // Restore
        }
        return possibleMoves;
    }


    // evaluateBoard(boardState, playerPerspectiveId)
    // Returns a score: playerPerspective's score - opponent's score
    function evaluateBoard(currentBoardState, playerPerspectiveId) {
        if (Object.keys(currentBoardState).length === 0 && playerPerspectiveId === 2 && player1Hand.length === NUM_TILES_PER_PLAYER) return -1000; // Heavily penalize P2 for not making the first move if board is empty
        if (Object.keys(currentBoardState).length === 0 && playerPerspectiveId === 1) return 0;


        const scores = calculateScoresForBoard(currentBoardState);
        if (playerPerspectiveId === 1) {
            return scores.player1Score - scores.player2Score;
        } else {
            return scores.player2Score - scores.player1Score;
        }
    }

    // Helper function to simulate the entire removal process for a given board state and acting player
    // boardState: The current state of the board in the simulation
    // actingPlayerId: The ID of the player whose turn it is in the simulation (who might get to choose a tile to remove)
    // Returns: { boardState: newBoardState, handGains: {playerId: [tilesReturned]} }
    // handGains will track tiles returned to any player's hand.
    function simulateRemovalCycle(initialBoardState, actingPlayerId) {
        let currentSimBoardState = deepCopyBoardState(initialBoardState);
        let tilesReturnedToHands = {}; // Tracks tiles returned, e.g., { 1: [tileA], 2: [tileB] }

        let surroundedTiles = getSurroundedTiles(currentSimBoardState);

        while (surroundedTiles.length > 0) {
            let tileToRemove = null;

            const opponentTilesSurrounded = surroundedTiles.filter(t => t.playerId !== actingPlayerId);
            const ownTilesSurrounded = surroundedTiles.filter(t => t.playerId === actingPlayerId);

            if (opponentTilesSurrounded.length > 0) {
                let bestRemovalChoice = null;
                let maxScoreAfterRemoval = -Infinity;

                for (const oppTile of opponentTilesSurrounded) {
                    const tempBoard = deepCopyBoardState(currentSimBoardState);
                    delete tempBoard[`${oppTile.x},${oppTile.y}`];
                    const score = evaluateBoard(tempBoard, actingPlayerId);
                    if (score > maxScoreAfterRemoval) {
                        maxScoreAfterRemoval = score;
                        bestRemovalChoice = oppTile;
                    }
                }
                tileToRemove = bestRemovalChoice;
            } else if (ownTilesSurrounded.length > 0) {
                // If only own tiles are surrounded, the first one found is chosen to be returned to hand.
                tileToRemove = ownTilesSurrounded[0];
            }

            if (tileToRemove) {
                delete currentSimBoardState[`${tileToRemove.x},${tileToRemove.y}`];
                if (!tilesReturnedToHands[tileToRemove.playerId]) {
                    tilesReturnedToHands[tileToRemove.playerId] = [];
                }
                tilesReturnedToHands[tileToRemove.playerId].push({
                    id: tileToRemove.id,
                    playerId: tileToRemove.playerId,
                    edges: [...tileToRemove.edges] // Store a copy of edges for potential re-instantiation
                });
                 // console.log(`Simulated removal: Tile ${tileToRemove.id} (P${tileToRemove.playerId}) removed from board ${tileToRemove.x},${tileToRemove.y}`);
            } else {
                // console.warn("Simulated removal: No tile chosen for removal despite surrounded tiles existing.");
                break; // No valid tile to remove found, break loop
            }
            surroundedTiles = getSurroundedTiles(currentSimBoardState); // Re-check for more surrounded tiles
        }
        return { boardState: currentSimBoardState, handGains: tilesReturnedToHands };
    }


    // findBestMoveMinimax(currentBoardState, aiHand, opponentHand, aiPlayerId, opponentPlayerId, depth)
    function findBestMoveMinimax(currentBoardState, aiHandOriginal, opponentHandOriginal, aiPlayerId, opponentPlayerId, depth) {
        const logPrefix = `Minimax (P${aiPlayerId} D${depth}): `;
        console.log(`${logPrefix}Starting evaluation. AI Hand: ${aiHandOriginal.length}, Opponent Hand: ${opponentHandOriginal.length}`);

        let bestMoveForAi = null;
        let maxScoreForAi = -Infinity;

        const aiHand = aiHandOriginal.map(t => new HexTile(t.id, t.playerId, [...t.edges]));
        const opponentHand = opponentHandOriginal.map(t => new HexTile(t.id, t.playerId, [...t.edges]));

        const possibleAiMoves = getAllPossibleMoves(currentBoardState, aiHand, aiPlayerId);
        console.log(`${logPrefix}Found ${possibleAiMoves.length} possible moves for AI (P${aiPlayerId}).`);

        if (depth === 0 || possibleAiMoves.length === 0) {
            const evalScore = evaluateBoard(currentBoardState, aiPlayerId);
            console.log(`${logPrefix}Base Case (depth 0 or no moves). Eval score: ${evalScore}`);
            return { score: evalScore, tile: null, x: null, y: null, orientation: null }; // Ensure consistent return structure
        }

        for (const aiMove of possibleAiMoves) {
            console.log(`${logPrefix}Considering AI move: Tile ${aiMove.tile.id}, Orient ${aiMove.orientation}, Pos (${aiMove.x},${aiMove.y})`);
            let boardAfterAiMove_sim = deepCopyBoardState(currentBoardState);
            const aiTileForSim = new HexTile(aiMove.tile.id, aiPlayerId, [...aiMove.tile.edges]);
            aiTileForSim.orientation = aiMove.orientation;
            aiTileForSim.x = aiMove.x;
            aiTileForSim.y = aiMove.y;
            boardAfterAiMove_sim[`${aiMove.x},${aiMove.y}`] = aiTileForSim;

            let currentAiHandSim = aiHand.filter(t => t.id !== aiMove.tile.id);
            let currentOpponentHandSim = opponentHand.map(t => new HexTile(t.id, t.playerId, [...t.edges]));
            // console.log(`${logPrefix}  AI Hand after move: ${currentAiHandSim.length}`);

            const removalResultAi = simulateRemovalCycle(boardAfterAiMove_sim, aiPlayerId);
            boardAfterAiMove_sim = removalResultAi.boardState;
            // console.log(`${logPrefix}  Board after AI move & P${aiPlayerId} removals: ${Object.keys(boardAfterAiMove_sim).length} tiles. Removals:`, removalResultAi.handGains);


            if (removalResultAi.handGains[aiPlayerId]) {
                removalResultAi.handGains[aiPlayerId].forEach(rt => currentAiHandSim.push(new HexTile(rt.id, rt.playerId, rt.edges)));
            }
            if (removalResultAi.handGains[opponentPlayerId]) {
                removalResultAi.handGains[opponentPlayerId].forEach(rt => currentOpponentHandSim.push(new HexTile(rt.id, rt.playerId, rt.edges)));
            }
            // console.log(`${logPrefix}  Hands after P${aiPlayerId} removals. AI: ${currentAiHandSim.length}, Opp: ${currentOpponentHandSim.length}`);


            if (currentAiHandSim.length === 0) {
                const score = evaluateBoard(boardAfterAiMove_sim, aiPlayerId);
                console.log(`${logPrefix}  AI (P${aiPlayerId}) runs out of tiles after this move. Score: ${score}`);
                if (score > maxScoreForAi) {
                    maxScoreForAi = score;
                    bestMoveForAi = { ...aiMove, score: maxScoreForAi };
                }
                continue; // Next AI move
            }

            // --- Opponent's Turn Simulation ---
            let minScoreAfterOpponentResponse = Infinity; // AI wants to maximize this value (which is P2_score - P1_score)
                                                       // So opponent (P1) wants to minimize this value from P2's perspective.
            const possibleOpponentMoves = getAllPossibleMoves(boardAfterAiMove_sim, currentOpponentHandSim, opponentPlayerId);
            // console.log(`${logPrefix}  Simulating P${opponentPlayerId}'s response. Found ${possibleOpponentMoves.length} opponent moves. Opponent Hand: ${currentOpponentHandSim.length}`);


            if (possibleOpponentMoves.length === 0 || currentOpponentHandSim.length === 0) {
                minScoreAfterOpponentResponse = evaluateBoard(boardAfterAiMove_sim, aiPlayerId);
                console.log(`${logPrefix}  Opponent (P${opponentPlayerId}) has no moves or no tiles. Score (from P${aiPlayerId}'s view): ${minScoreAfterOpponentResponse}`);
            } else {
                for (const opponentMove of possibleOpponentMoves) {
                    // console.log(`${logPrefix}    Considering Opponent (P${opponentPlayerId}) move: Tile ${opponentMove.tile.id}, Orient ${opponentMove.orientation}, Pos (${opponentMove.x},${opponentMove.y})`);
                    let boardAfterOpponentMove_sim = deepCopyBoardState(boardAfterAiMove_sim);
                    const opponentTileForSim = new HexTile(opponentMove.tile.id, opponentPlayerId, [...opponentMove.tile.edges]);
                    opponentTileForSim.orientation = opponentMove.orientation;
                    opponentTileForSim.x = opponentMove.x;
                    opponentTileForSim.y = opponentMove.y;
                    boardAfterOpponentMove_sim[`${opponentMove.x},${opponentMove.y}`] = opponentTileForSim;

                    let simOpponentHandAfterMove = currentOpponentHandSim.filter(t => t.id !== opponentMove.tile.id);
                    let simAiHandForNextTurn = currentAiHandSim.map(t => new HexTile(t.id, t.playerId, [...t.edges]));


                    const removalResultOpponent = simulateRemovalCycle(boardAfterOpponentMove_sim, opponentPlayerId);
                    boardAfterOpponentMove_sim = removalResultOpponent.boardState;
                    // console.log(`${logPrefix}      Board after P${opponentPlayerId} move & removals: ${Object.keys(boardAfterOpponentMove_sim).length} tiles. Removals:`, removalResultOpponent.handGains);


                    if (removalResultOpponent.handGains[opponentPlayerId]) {
                        removalResultOpponent.handGains[opponentPlayerId].forEach(rt => simOpponentHandAfterMove.push(new HexTile(rt.id, rt.playerId, rt.edges)));
                    }
                    if (removalResultOpponent.handGains[aiPlayerId]) {
                        removalResultOpponent.handGains[aiPlayerId].forEach(rt => simAiHandForNextTurn.push(new HexTile(rt.id, rt.playerId, rt.edges)));
                    }
                    // console.log(`${logPrefix}      Hands after P${opponentPlayerId} removals. AI: ${simAiHandForNextTurn.length}, Opp: ${simOpponentHandAfterMove.length}`);


                    let currentTurnScore;
                    if (depth - 1 === 0) {
                        currentTurnScore = evaluateBoard(boardAfterOpponentMove_sim, aiPlayerId);
                        // console.log(`${logPrefix}      Depth 0 for opponent. Final eval score (P${aiPlayerId}'s view): ${currentTurnScore}`);
                    } else {
                        // This recursive call makes it a true multi-depth minimax, but for "Greedy 2" (P2 move, P1 response, eval), depth is 1 initially.
                        // So this branch means we are looking further than P1's immediate response.
                        console.log(`${logPrefix}      Recursing for P${aiPlayerId}'s next move. Depth: ${depth-1}`);
                        const nextState = findBestMoveMinimax(boardAfterOpponentMove_sim, simAiHandForNextTurn, simOpponentHandAfterMove, aiPlayerId, opponentPlayerId, depth - 1);
                        currentTurnScore = nextState.score; // Score is from AI's perspective
                        // console.log(`${logPrefix}      Recursive call returned score: ${currentTurnScore}`);
                    }

                    if (currentTurnScore < minScoreAfterOpponentResponse) {
                        minScoreAfterOpponentResponse = currentTurnScore;
                    }
                }
            }
            console.log(`${logPrefix}  For AI move (Tile ${aiMove.tile.id} @(${aiMove.x},${aiMove.y}) O${aiMove.orientation}), worst opponent response leads to score (for AI P${aiPlayerId}): ${minScoreAfterOpponentResponse}`);

            if (minScoreAfterOpponentResponse > maxScoreForAi) {
                maxScoreForAi = minScoreAfterOpponentResponse;
                bestMoveForAi = { ...aiMove, score: maxScoreForAi }; // aiMove already contains tile, x, y, orientation
                console.log(`${logPrefix}  NEW BEST MOVE FOUND for P${aiPlayerId}: Tile ${bestMoveForAi.tile.id}, Pos (${bestMoveForAi.x},${bestMoveForAi.y}), Orient ${bestMoveForAi.orientation}, Score: ${maxScoreForAi}`);
            }
        }

        if (bestMoveForAi) {
            console.log(`${logPrefix}Best overall move for AI (P${aiPlayerId}) is Tile ${bestMoveForAi.tile.id}, Orient ${bestMoveForAi.orientation}, Pos (${bestMoveForAi.x},${bestMoveForAi.y}), resulting score ${bestMoveForAi.score}`);
        } else if (possibleAiMoves.length > 0) {
            console.warn(`${logPrefix}P${aiPlayerId} - No move improved score from initial -Infinity. Fallback to first possible move.`);
            // Fallback logic: Recalculate score for the first move to ensure it's properly evaluated through the opponent's turn.
            const firstMove = possibleAiMoves[0];
            let boardAfterAiMove_sim = deepCopyBoardState(currentBoardState);
            const aiTileForSim = new HexTile(firstMove.tile.id, aiPlayerId, [...firstMove.tile.edges]);
            aiTileForSim.orientation = firstMove.orientation;
            aiTileForSim.x = firstMove.x;
            aiTileForSim.y = firstMove.y;
            boardAfterAiMove_sim[`${firstMove.x},${firstMove.y}`] = aiTileForSim;
            let currentAiHandSim = aiHand.filter(t => t.id !== firstMove.tile.id);
            let currentOpponentHandSim = opponentHand.map(t => new HexTile(t.id, t.playerId, [...t.edges]));
            const rA = simulateRemovalCycle(boardAfterAiMove_sim, aiPlayerId);
            boardAfterAiMove_sim = rA.boardState;
            if(rA.handGains[aiPlayerId]) rA.handGains[aiPlayerId].forEach(rt => currentAiHandSim.push(new HexTile(rt.id, rt.playerId, rt.edges)));
            if(rA.handGains[opponentPlayerId]) rA.handGains[opponentPlayerId].forEach(rt => currentOpponentHandSim.push(new HexTile(rt.id, rt.playerId, rt.edges)));

            let scoreToAssign = evaluateBoard(boardAfterAiMove_sim, aiPlayerId); // Default if opponent has no move
            const possibleOpponentMoves = getAllPossibleMoves(boardAfterAiMove_sim, currentOpponentHandSim, opponentPlayerId);
            if (possibleOpponentMoves.length > 0 && currentOpponentHandSim.length > 0) {
                let minScore = Infinity;
                for(const opponentMove of possibleOpponentMoves) {
                    let boardAfterOpponentMove_sim = deepCopyBoardState(boardAfterAiMove_sim);
                    const oppTileClone = new HexTile(opponentMove.tile.id, opponentPlayerId, [...opponentMove.tile.edges]);
                    oppTileClone.orientation = opponentMove.orientation;
                    oppTileClone.x = opponentMove.x;
                    oppTileClone.y = opponentMove.y;
                    boardAfterOpponentMove_sim[`${oppTileClone.x},${oppTileClone.y}`] = oppTileClone;
                    const rO = simulateRemovalCycle(boardAfterOpponentMove_sim, opponentPlayerId);
                    const evalScore = evaluateBoard(rO.boardState, aiPlayerId);
                    if (evalScore < minScore) minScore = evalScore;
                }
                scoreToAssign = minScore;
            }
            bestMoveForAi = { ...firstMove, score: scoreToAssign };
            console.log(`${logPrefix}Fallback selected: Tile ${bestMoveForAi.tile.id}, Pos (${bestMoveForAi.x},${bestMoveForAi.y}), Orient ${bestMoveForAi.orientation}, Score ${bestMoveForAi.score}`);
        } else {
            console.log(`${logPrefix}AI (P${aiPlayerId}) could not find any move (no possible moves). Returning score -Infinity.`);
            return { score: -Infinity, tile: null, x:null, y:null, orientation:null }; // No moves possible, very bad
        }
        return bestMoveForAi;
    }

});
