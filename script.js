document.addEventListener('DOMContentLoaded', () => {
    const BOARD_SIZE = 15; // Example size, can be adjusted. This will define the logical grid.
    const NUM_TILES_PER_PLAYER = 14;

    // Canvas setup
    const gameCanvas = document.getElementById('game-canvas');
    const ctx = gameCanvas.getContext('2d');
    // gameBoard variable now refers to the canvas element for consistency,
    // though we'll primarily use ctx for drawing.
    const gameBoard = gameCanvas; // Keep existing references if they are used for width/height etc.

let player1HandDisplay = document.querySelector('#player1-hand .tiles-container'); // Will be updated in renderPlayerHands
let player2HandDisplay = document.querySelector('#player2-hand .tiles-container'); // Will be updated in renderPlayerHands
    // const currentPlayerDisplay = document.getElementById('current-player'); // Removed
    // const gameMessageDisplay = document.getElementById('game-message'); // Removed
    // const player1ScoreDisplay = document.getElementById('player1-score'); // Removed
    // const player2ScoreDisplay = document.getElementById('player2-score'); // Removed
    const playerScoresContainer = document.getElementById('player-scores'); // New container for scores
    let p1ScoreDisplayFloater, p2ScoreDisplayFloater; // Will be created dynamically

    const resetGameButton = document.getElementById('reset-game');
    // player1HandContainer and player2HandContainer will be created dynamically
    let player1HandContainer, player2HandContainer;
    let opponentTypeSelector; // Will be assigned when player 2 hand is created

    const playerHandsDisplay = document.getElementById('player-hands');


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
    let opponentType = "greedy"; // Default to Greedy 1 opponent
    let mouseHoverQ = null;
    let mouseHoverR = null;

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

            if (currentPlayer === 2 && (opponentType === 'random' || opponentType === 'greedy' || opponentType === 'greedy2')) {
                // AI's turn and more tiles to remove, let AI continue removing
                // gameMessageDisplay.textContent = `Player 2 (AI - ${opponentType}) is removing more tiles...`; // Removed
                console.log(`Player 2 (AI - ${opponentType}) is removing more tiles...`);
                console.log("AI continues tile removal process. New list:", newSurroundedList.map(t => t.id));
                // Pulse should continue if AI is still thinking about next removal
                console.log("[removeTileFromBoardAndReturnToHand] AI continues tile removal process via worker.");
                // Pulse is already active or will be re-activated by initiateAiTileRemoval if needed by worker response
                player2HandContainer.classList.add('ai-thinking-pulse'); // Ensure it's on
                redrawBoardOnCanvas(); // Update highlights for the AI's next choice
                initiateAiTileRemoval(); // Re-trigger AI removal for the next tile
            } else {
                // Human player's turn, or AI is human - prompt for click
                console.log("[removeTileFromBoardAndReturnToHand] REMOVING ai-thinking-pulse (human's turn for removal)");
                player2HandContainer.classList.remove('ai-thinking-pulse'); // Stop pulse if human's turn for removal
                console.log(`Player ${currentPlayer}, click on a highlighted tile to remove it.`);
                redrawBoardOnCanvas(); // Redraw to update highlights for human player
            }
        } else {
            // No more tiles are surrounded, end the removal phase
            console.log("No more surrounded tiles. Ending removal phase.");
            console.log("[removeTileFromBoardAndReturnToHand] REMOVING ai-thinking-pulse (no more tiles to remove)");
            player2HandContainer.classList.remove('ai-thinking-pulse'); // Stop pulsing
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
    // transparentBackground: if true, skips drawing the white background fill of the hexagon body
    function drawHexTile(ctx, cx, cy, tile, zoom = 1.0, transparentBackground = false) {
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

        // Requirement 3.2: Conditionally skip background fill
        if (!transparentBackground) {
            ctx.fillStyle = 'white';
            ctx.fill();
        }
        // Stroke is always drawn for the hexagon outline itself
        ctx.strokeStyle = '#333'; // This is the tile's own border, not the preview border
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

        // displayPlayerHand(1, player1Hand, player1HandDisplay); // Removed: Called by renderPlayerHands
        // displayPlayerHand(2, player2Hand, player2HandDisplay); // Removed: Called by renderPlayerHands

        // renderPlayerHands will set opponentTypeSelector.value and opponentType
        // It also creates and assigns player1HandContainer and player2HandContainer.
        renderPlayerHands();

        // updateGameInfo must be called AFTER renderPlayerHands so that hand containers are defined.
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

    // --- Web Worker Setup ---
    let aiWorker;
    if (window.Worker) {
        aiWorker = new Worker('aiWorker.js');
        aiWorker.onmessage = function(e) {
            // console.log('[Main] Message received from worker:', e.data);
            const { task, move, tileToRemove } = e.data;

            if (task === 'aiMoveResult') {
                handleAiMoveResult(move);
            } else if (task === 'aiTileRemovalResult') {
                handleAiTileRemovalResult(tileToRemove);
            }
        };
        aiWorker.onerror = function(error) {
            console.error('[Main] Error from AI Worker:', error.message, error);
            // Stop pulsing if worker crashes
            if (player2HandContainer) player2HandContainer.classList.remove('ai-thinking-pulse');
            // Potentially switch turn or notify user
        };
    } else {
        console.error('Web Workers are not supported in this browser.');
        // Fallback or error message for the user
    }


    // --- Player Actions ---
    let currentlySelectedTileCanvas = null; // Keep track of the currently selected canvas tile in hand

    // Function to draw a preview of the tile at a given board location
    // q, r: logical grid coordinates for the preview
    // tile: the HexTile object (not used for drawing, but for context if needed)
    // borderColor: CSS color string for the border (e.g., 'green' or 'yellow')
    function drawPlacementPreview(q, r, tile, borderColor) {
        const effectiveZoom = currentZoomLevel;
        const originalScaledHexSideLength = BASE_HEX_SIDE_LENGTH * effectiveZoom;
        const borderWidth = 2.5 * effectiveZoom; // Defined upfront for clarity

        // Convert logical grid (q,r) to screen coordinates for drawing
        const screenX = currentOffsetX + (BASE_HEX_SIDE_LENGTH * currentZoomLevel) * (3/2 * q);
        const screenY = currentOffsetY + (BASE_HEX_SIDE_LENGTH * currentZoomLevel) * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);

        // --- Draw Fill (if applicable) ---
        // The fill should be drawn *within* the border.
        // So, the path for the fill should use a side length reduced by the border width.
        const fillHexSideLength = originalScaledHexSideLength - borderWidth;

        if (mouseHoverQ !== q || mouseHoverR !== r) {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = Math.PI / 180 * (60 * i);
                // Use fillHexSideLength for the fill path
                const xPos = screenX + fillHexSideLength * Math.cos(angle);
                const yPos = screenY + fillHexSideLength * Math.sin(angle);
                if (i === 0) {
                    ctx.moveTo(xPos, yPos);
                } else {
                    ctx.lineTo(xPos, yPos);
                }
            }
            ctx.closePath();

            if (borderColor === 'green') {
                ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
            } else if (borderColor === 'yellow') {
                ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
            } else {
                ctx.fillStyle = 'rgba(128, 128, 128, 0.1)';
            }
            ctx.fill();
        }

        // --- Draw Border (inset) ---
        // The border is drawn on a path that is also inset.
        // The visual effect is that the fill is contained by the border.
        // The border path itself is effectively centered on `originalScaledHexSideLength - borderWidth`.
        // And its thickness (`borderWidth`) extends inwards and outwards from that path.
        // To make the fill truly *not extend past the outer edge of the border*,
        // the fill path should be `originalScaledHexSideLength - borderWidth`.
        // And the border path should be `originalScaledHexSideLength - (borderWidth / 2)` if we want the line to be centered.
        // However, the current border drawing logic already uses `originalScaledHexSideLength - borderWidth` for its path.
        // This means the *center* of the border line is on this smaller hexagon.
        // The line then has width, extending `borderWidth / 2` inwards and `borderWidth / 2` outwards from this path.
        // So the *outer edge* of the border is at `originalScaledHexSideLength - borderWidth + borderWidth/2 = originalScaledHexSideLength - borderWidth/2`.
        // And the *inner edge* of the border is at `originalScaledHexSideLength - borderWidth - borderWidth/2 = originalScaledHexSideLength - 1.5 * borderWidth`.

        // To ensure the fill does not extend *past the outer edge of the border line*,
        // the fill path should be sized such that its edge aligns with or is inside the *outer edge* of the border.
        // Current border path uses: originalScaledHexSideLength - borderWidth
        // If fill uses: originalScaledHexSideLength - borderWidth, it will align with the center of the border.
        // This is acceptable and achieves the goal of the fill not extending *beyond* the overall border area.

        const borderPathSideLength = originalScaledHexSideLength - (borderWidth / 2); // Center the border line correctly

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 180 * (60 * i);
            // Use borderPathSideLength for the border path
            const xPos = screenX + borderPathSideLength * Math.cos(angle);
            const yPos = screenY + borderPathSideLength * Math.sin(angle);
            if (i === 0) {
                ctx.moveTo(xPos, yPos);
            } else {
                ctx.lineTo(xPos, yPos);
            }
        }
        ctx.closePath();

        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth; // Use the predefined border width
        ctx.stroke();
    }

    // Function to draw the full translucent tile preview on mouseover
    function drawFullTileMouseoverPreview(q, r, tile) {
        // Requirement 2.1: Ensure 100% scale factor.
        // The effectiveZoom for drawHexTile should be currentZoomLevel.
        const effectiveZoom = currentZoomLevel;

        // Convert logical grid (q,r) to screen coordinates for drawing
        const screenX = currentOffsetX + (BASE_HEX_SIDE_LENGTH * currentZoomLevel) * (3/2 * q);
        const screenY = currentOffsetY + (BASE_HEX_SIDE_LENGTH * currentZoomLevel) * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);

        ctx.save();
        ctx.globalAlpha = 0.6; // Translucency for the preview
        // Requirement 2.3 (handled in drawHexTile modification): Pass transparentBackground = true
        drawHexTile(ctx, screenX, screenY, tile, effectiveZoom, true); // Draw the actual tile, scaled, with transparent background
        ctx.restore();
    }


    function updatePlacementHighlights() {
        // This function now only draws the board and the green/yellow spots.
        // The mouseover full preview is handled separately by the mousemove event.
        if (!selectedTile) {
            redrawBoardOnCanvas();
            return;
        }

        redrawBoardOnCanvas(); // Redraw existing tiles first

        const tileToPlace = selectedTile.tile;
        const currentSelectedOrientation = tileToPlace.orientation;

        const checkRadius = 8;
        let qMin = -checkRadius, qMax = checkRadius, rMin = -checkRadius, rMax = checkRadius;

        if (Object.keys(boardState).length > 0) {
            let minPlacedQ = Infinity, maxPlacedQ = -Infinity, minPlacedR = Infinity, maxPlacedR = -Infinity;
            Object.values(boardState).forEach(tile => {
                minPlacedQ = Math.min(minPlacedQ, tile.x);
                maxPlacedQ = Math.max(maxPlacedQ, tile.x);
                minPlacedR = Math.min(minPlacedR, tile.y);
                maxPlacedR = Math.max(maxPlacedR, tile.y);
            });
            qMin = minPlacedQ - checkRadius / 2;
            qMax = maxPlacedQ + checkRadius / 2;
            rMin = minPlacedR - checkRadius / 2;
            rMax = maxPlacedR + checkRadius / 2;
        }

        for (let q = Math.floor(qMin); q <= Math.ceil(qMax); q++) {
            for (let r = Math.floor(rMin); r <= Math.ceil(rMax); r++) {
                if (boardState[`${q},${r}`]) continue;

                tileToPlace.orientation = currentSelectedOrientation;
                if (isPlacementValid(tileToPlace, q, r, true)) {
                    drawPlacementPreview(q, r, tileToPlace, 'green');
                } else {
                    let canPlaceOtherOrientation = false;
                    let validPreviewOrientation = -1;
                    for (let i = 0; i < 6; i++) {
                        if (i === currentSelectedOrientation) continue;
                        tileToPlace.orientation = i;
                        if (isPlacementValid(tileToPlace, q, r, true)) {
                            canPlaceOtherOrientation = true;
                            validPreviewOrientation = i;
                            break;
                        }
                    }
                    tileToPlace.orientation = currentSelectedOrientation; // Restore

                    if (canPlaceOtherOrientation) {
                        // For yellow spots, we pass a temporary tile with the valid orientation
                        // to drawPlacementPreview, but the actual tile in hand remains unchanged.
                        const tempTileForYellowPreview = new HexTile(tileToPlace.id, tileToPlace.playerId, [...tileToPlace.edges]);
                        tempTileForYellowPreview.orientation = validPreviewOrientation;
                        drawPlacementPreview(q, r, tempTileForYellowPreview, 'yellow');
                    }
                }
            }
        }
        tileToPlace.orientation = currentSelectedOrientation; // Ensure original orientation is set
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
                switchTurn(); // Always switch turn, game end is checked at the start of the next turn
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

            if (currentPlayer === 2 && ['random', 'greedy', 'greedy2'].includes(opponentType)) {
                // AI's turn and tiles are surrounded by its move, start AI removal process
                console.log(`Player 2 (AI - ${opponentType}) is starting tile removal...`);
                redrawBoardOnCanvas(); // Show highlights
                if (player2HandContainer) player2HandContainer.classList.add('ai-thinking-pulse'); // Start pulse
                initiateAiTileRemoval(); // Call worker
            } else {
                // Human player's turn, or AI is human - prompt for click
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

        // Moved renderPlayerHands earlier so player2HandContainer is correctly defined before pulse class is added.
        renderPlayerHands();

        // Check if AI needs to make a move or remove a tile
        if (currentPlayer === 2 && !isRemovingTiles && ['random', 'greedy', 'greedy2'].includes(opponentType)) {
            console.log("Player 2 (AI) is thinking... (via switchTurn)");
            if (player2HandContainer) player2HandContainer.classList.add('ai-thinking-pulse');
            initiateAiMove();
        } else if (currentPlayer === 2 && isRemovingTiles && ['random', 'greedy', 'greedy2'].includes(opponentType)) {
            console.log("Player 2 (AI) is choosing a tile to remove... (via switchTurn)");
            if (player2HandContainer) player2HandContainer.classList.add('ai-thinking-pulse');
            initiateAiTileRemoval();
        }
    }


    // --- Functions to initiate AI actions via Web Worker ---
    function initiateAiMove() {
        if (!aiWorker) {
            console.error("AI Worker not initialized. Cannot perform AI move.");
            // Fallback: maybe switch turn or show error
            if (player2HandContainer) player2HandContainer.classList.remove('ai-thinking-pulse');
            switchTurn(); // Or handle error more gracefully
            return;
        }
        console.log("[Main] Initiating AI move via worker.");
        // Ensure hands and boardState are plain data for the worker
        const plainPlayer1Hand = player1Hand.map(tile => ({ id: tile.id, playerId: tile.playerId, edges: [...tile.edges], orientation: tile.orientation }));
        const plainPlayer2Hand = player2Hand.map(tile => ({ id: tile.id, playerId: tile.playerId, edges: [...tile.edges], orientation: tile.orientation }));
        const plainBoardState = {};
        for (const key in boardState) {
            const tile = boardState[key];
            plainBoardState[key] = { id: tile.id, playerId: tile.playerId, edges: [...tile.edges], orientation: tile.orientation, x: tile.x, y: tile.y };
        }

        aiWorker.postMessage({
            task: 'aiMove',
            boardState: plainBoardState,
            player1Hand: plainPlayer1Hand, // Opponent's hand for Minimax
            player2Hand: plainPlayer2Hand, // AI's hand
            opponentType: opponentType,
            currentPlayerId: currentPlayer // Should be 2
        });
    }

    function initiateAiTileRemoval() {
        if (!aiWorker) {
            console.error("AI Worker not initialized. Cannot perform AI tile removal.");
            if (player2HandContainer) player2HandContainer.classList.remove('ai-thinking-pulse');
            // Fallback or error handling
            isRemovingTiles = false; // Exit removal mode
            currentSurroundedTilesForRemoval = [];
            redrawBoardOnCanvas(); // Clear highlights
            switchTurn(); // Or handle error
            return;
        }
        console.log("[Main] Initiating AI tile removal via worker.");
        const plainBoardState = {};
        for (const key in boardState) {
            const tile = boardState[key];
            plainBoardState[key] = { id: tile.id, playerId: tile.playerId, edges: [...tile.edges], orientation: tile.orientation, x: tile.x, y: tile.y };
        }
        // currentSurroundedTilesForRemoval are already HexTile instances, convert to plain objects
        const plainSurroundedTiles = currentSurroundedTilesForRemoval.map(tile => ({
            id: tile.id, playerId: tile.playerId, edges: [...tile.edges], orientation: tile.orientation, x: tile.x, y: tile.y
        }));

        aiWorker.postMessage({
            task: 'aiTileRemoval',
            boardState: plainBoardState,
            currentSurroundedTiles: plainSurroundedTiles,
            opponentType: opponentType,
            currentPlayerId: currentPlayer // Should be 2
        });
    }

    // --- Functions to handle results from AI Web Worker ---
    function handleAiMoveResult(move) {
        // console.log("[Main] Received AI move result from worker:", move);
        if (player2HandContainer) player2HandContainer.classList.remove('ai-thinking-pulse');

        if (move && typeof move.tileId !== 'undefined' && typeof move.orientation !== 'undefined') {
            const tileToPlace = player2Hand.find(t => t.id === move.tileId);
            if (!tileToPlace) {
                console.error(`[Main] AI Error: Best move tile (ID: ${move.tileId}) not found in player 2 hand.`);
                switchTurn(); return;
            }
            tileToPlace.orientation = move.orientation; // Use the standardized top-level orientation

            console.log(`[Main] AI (${opponentType}) attempting to place tile ${tileToPlace.id} (orientation: ${tileToPlace.orientation}) at (${move.x}, ${move.y})`);
            if (placeTileOnBoard(tileToPlace, move.x, move.y)) {
                player2Hand = player2Hand.filter(t => t.id !== tileToPlace.id);
                displayPlayerHand(2, player2Hand, player2HandDisplay);
                console.log(`[Main] AI (${opponentType}) successfully placed tile ${tileToPlace.id}.`);

                const surroundedAfterAiMove = getSurroundedTiles(boardState);
                if (surroundedAfterAiMove.length === 0) {
                     // Pulse was already removed, no need to remove again
                }
                checkForSurroundedTilesAndProceed();
                updateViewParameters();
                animateView();
            } else {
                // The error message now correctly reflects the orientation being used.
                console.error(`[Main] AI (${opponentType}) failed to place tile ${tileToPlace.id} (orientation: ${tileToPlace.orientation}) at (${move.x}, ${move.y}). This should ideally be caught by worker's validation.`);
                switchTurn();
            }
        } else {
            console.log(`[Main] AI (${opponentType}) could not find any valid move, passed, or move object was malformed. Passing turn. Move received:`, move);
            calculateScores();
            switchTurn();
        }
    }

    function handleAiTileRemovalResult(tileToRemoveData) {
        // console.log("[Main] Received AI tile removal result from worker:", tileToRemoveData);
        // Pulse will be handled by removeTileFromBoardAndReturnToHand or if no more removals.

        if (tileToRemoveData) {
            const tileKey = `${tileToRemoveData.x},${tileToRemoveData.y}`;
            const actualTileToRemove = boardState[tileKey];

            if (actualTileToRemove && actualTileToRemove.id === tileToRemoveData.id) {
                console.log(`[Main] AI (${opponentType}) removes tile ${actualTileToRemove.id}.`);
                removeTileFromBoardAndReturnToHand(actualTileToRemove); // This function handles further pulsing logic
            } else {
                console.error(`[Main] AI Error: Tile to remove ${tileToRemoveData.id} at (${tileToRemoveData.x},${tileToRemoveData.y}) not found or ID mismatch on board.`);
                // Fallback: exit removal mode
                if (player2HandContainer) player2HandContainer.classList.remove('ai-thinking-pulse');
                isRemovingTiles = false;
                currentSurroundedTilesForRemoval = [];
                redrawBoardOnCanvas();
                switchTurn();
            }
        } else {
            console.error("[Main] AI: Error in tile removal decision from worker (no tile returned).");
            if (player2HandContainer) player2HandContainer.classList.remove('ai-thinking-pulse');
            isRemovingTiles = false;
            currentSurroundedTilesForRemoval = [];
            redrawBoardOnCanvas();
            calculateScores();
            switchTurn();
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
        let celebratoryMessage = "";

        if (player1Score > player2Score) { // Player 1 wins
            if (opponentType === "human") {
                celebratoryMessage = "Player 1 Wins!";
            } else { // Player 2 is AI
                celebratoryMessage = "You Win!";
            }
        } else if (player2Score > player1Score) { // Player 2 wins
            if (opponentType === "human") {
                celebratoryMessage = "Player 2 Wins!";
            } else { // Player 2 is AI
                celebratoryMessage = "Player 2 wins"; // Muted message
            }
        } else { // Tie
            celebratoryMessage = "It's a tie!";
        }

        // Log the original detailed message to the console for debugging/info
        let detailedMessage = "";
        if (player1Score > player2Score) {
            detailedMessage = `Player 1 wins with ${player1Score} points! (Player 2: ${player2Score})`;
        } else if (player2Score > player1Score) {
            detailedMessage = `Player 2 wins with ${player2Score} points! (Player 1: ${player1Score})`;
        } else {
            detailedMessage = `It's a tie! Both players have ${player1Score} points.`;
        }
        console.log(`Game Over! ${detailedMessage}`);
        console.log("Game ended. ", detailedMessage);

        // Display the celebratory message to the user
        alert(celebratoryMessage);

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
        const preservedOpponentType = opponentTypeSelector ? opponentTypeSelector.value : "greedy"; // Store current opponent type
        // initializeGame() already handles clearing the canvas and resetting state.
        initializeGame();
        // opponentTypeSelector will be re-created by renderPlayerHands called in initializeGame
        // We need to set its value *after* it's created.
        if (opponentTypeSelector) {
            opponentTypeSelector.value = preservedOpponentType;
        }
        opponentType = preservedOpponentType; // Update internal variable
        console.log(`Opponent type preserved as: ${opponentType}`);
    });

    // --- Player Hand Rendering ---
    function renderPlayerHands() {
        playerHandsDisplay.innerHTML = ''; // Clear existing hands

        const hand1Div = document.createElement('div');
        hand1Div.id = 'player1-hand';
        hand1Div.classList.add('player-hand');
        hand1Div.innerHTML = `<h2>Player 1 Hand</h2><div class="tiles-container"></div>`;
        // Assign to global variable player1HandDisplay
        player1HandDisplay = hand1Div.querySelector('.tiles-container');

        const hand2Div = document.createElement('div');
        hand2Div.id = 'player2-hand';
        hand2Div.classList.add('player-hand');
        hand2Div.innerHTML = `
            <div class="player2-hand-header">
                <h2>Player 2 Hand</h2>
                <div id="opponent-selector-container">
                    <label for="opponent-type">Opponent (Player 2):</label>
                    <select id="opponent-type">
                        <option value="human">Human</option>
                        <option value="random">Random (CPU)</option>
                        <option value="greedy">Greedy 1 (CPU)</option>
                        <option value="greedy2">Greedy 2 (CPU)</option>
                    </select>
                </div>
            </div>
            <div class="tiles-container"></div>`;
        // Assign to global variable player2HandDisplay
        player2HandDisplay = hand2Div.querySelector('.tiles-container');

        if (currentPlayer === 1) {
            playerHandsDisplay.appendChild(hand1Div);
            playerHandsDisplay.appendChild(hand2Div);
        } else {
            playerHandsDisplay.appendChild(hand2Div);
            playerHandsDisplay.appendChild(hand1Div);
        }

        // Re-assign global container vars and opponent selector
        player1HandContainer = document.getElementById('player1-hand');
        player2HandContainer = document.getElementById('player2-hand');
        opponentTypeSelector = document.getElementById('opponent-type');

        // Restore opponent type if selector exists and type is known
        if (opponentTypeSelector) {
            opponentTypeSelector.value = opponentType || "greedy"; // Default to greedy if not set
            opponentType = opponentTypeSelector.value; // Ensure internal var matches

            // Re-attach event listener for opponent type selector
            opponentTypeSelector.removeEventListener('change', handleOpponentTypeChange); // Remove old if any
            opponentTypeSelector.addEventListener('change', handleOpponentTypeChange);
        }


        // Re-display tiles in the new containers
        // Ensure the correct display elements are targeted (the .tiles-container within the new divs)
        // Use the now-updated global player1HandDisplay and player2HandDisplay

        if (player1HandDisplay) displayPlayerHand(1, player1Hand, player1HandDisplay);
        else console.error("Could not find .tiles-container for player 1 hand (player1HandDisplay is null after renderPlayerHands).");

        if (player2HandDisplay) displayPlayerHand(2, player2Hand, player2HandDisplay);
        else console.error("Could not find .tiles-container for player 2 hand (player2HandDisplay is null after renderPlayerHands).");

        updateHandHighlights(); // Apply active/inactive styles
    }

    function handleOpponentTypeChange(event) {
        opponentType = event.target.value;
        console.log(`Opponent type changed to: ${opponentType}`);

        // If it's Player 2's turn and a CPU opponent is selected, and not in removal phase,
        // let the AI make a move.
        if (currentPlayer === 2 && ['random', 'greedy', 'greedy2'].includes(opponentType) && !isRemovingTiles) {
            console.log("Player 2 (AI) is thinking... (opponent type changed)");
            if (player2HandContainer) player2HandContainer.classList.add('ai-thinking-pulse');
            initiateAiMove();
        }
        // If it's Player 2's turn, in removal phase, and a CPU opponent is selected
        else if (currentPlayer === 2 && ['random', 'greedy', 'greedy2'].includes(opponentType) && isRemovingTiles) {
            console.log("Player 2 (AI) is choosing a tile to remove... (opponent type changed)");
            if (player2HandContainer) player2HandContainer.classList.add('ai-thinking-pulse');
            initiateAiTileRemoval();
        } else if (opponentType === 'human' || currentPlayer === 1) {
            if (player2HandContainer) player2HandContainer.classList.remove('ai-thinking-pulse');
        }
    }

    // --- Start the game ---
    initializeGame();


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
                removeTileFromBoardAndReturnToHand(clickedTile);
            } else {
                console.log("Invalid selection. Click on a highlighted (surrounded) tile to remove it.");
            }
        } else {
            // --- Handle Tile Placement Click (existing logic) ---
            if (!selectedTile) {
                console.log("Please select a tile from your hand first.");
                return;
            }
            if (selectedTile.originalPlayerId !== currentPlayer) {
                console.log("Error: Tile selection does not match current player (should not happen).");
                return;
            }
            handleCellClick(q, r);
        }
    });

    // --- Canvas MouseMove Handling for Tile Preview ---
    gameCanvas.addEventListener('mousemove', (event) => {
        if (!selectedTile || isRemovingTiles) {
            // If no tile is selected or if in removal mode, clear hover state and redraw to remove any lingering preview
            if (mouseHoverQ !== null || mouseHoverR !== null) {
                mouseHoverQ = null;
                mouseHoverR = null;
                updatePlacementHighlights(); // Redraw to clear potential preview
                // If animateView is running, it might also call updatePlacementHighlights.
                // Consider if a more direct clear is needed or if this is sufficient.
            }
            return;
        }

        const rect = gameCanvas.getBoundingClientRect();
        const pixelX = event.clientX - rect.left;
        const pixelY = event.clientY - rect.top;
        const { q, r } = pixelToHexGrid(pixelX, pixelY);

        // Update hover coordinates only if they change, to avoid excessive redraws if mouse is still but event fires
        if (q === mouseHoverQ && r === mouseHoverR) {
            return;
        }
        mouseHoverQ = q;
        mouseHoverR = r;

        // Redraw board and base highlights first. This clears previous full preview.
        updatePlacementHighlights();

        // Now, check if the hovered spot is valid for the selected tile and draw full preview if so.
        const tileToPlace = selectedTile.tile; // This is the actual tile in hand with its current orientation

        // We need to determine if the spot q,r is one of the highlighted spots (green or yellow)
        // updatePlacementHighlights() already determined this and drew the border.
        // We just need to know if we *should* draw the full tile preview.
        // A spot is highlighted if it's empty AND (valid for current orientation OR valid for any other orientation)

        let isSpotHighlightedGreenOrYellow = false;
        if (!boardState[`${q},${r}`]) { // Check if cell is empty
            const originalOrientation = tileToPlace.orientation; // Preserve original
            if (isPlacementValid(tileToPlace, q, r, true)) {
                isSpotHighlightedGreenOrYellow = true;
            } else {
                for (let i = 0; i < 6; i++) {
                    if (i === originalOrientation) continue;
                    tileToPlace.orientation = i;
                    if (isPlacementValid(tileToPlace, q, r, true)) {
                        isSpotHighlightedGreenOrYellow = true;
                        break;
                    }
                }
            }
            tileToPlace.orientation = originalOrientation; // Restore original orientation
        }

        // Requirement 4: If the player is mousing over a highlighted spot (green or yellow),
        // show what the current tile + rotation would look like.
        if (isSpotHighlightedGreenOrYellow) {
            // Always draw the selectedTile.tile with its CURRENT orientation.
            // The border color (green/yellow) is already handled by drawPlacementPreview
            // called from updatePlacementHighlights().
            // The removal of the faint fill when hovered is also handled by drawPlacementPreview.
            drawFullTileMouseoverPreview(q, r, tileToPlace);
        }
        // No 'else if' needed here. If the spot wasn't green or yellow, no full preview is drawn.
    });

    gameCanvas.addEventListener('mouseout', () => {
        // When mouse leaves canvas, clear hover state and redraw to remove preview
        if (mouseHoverQ !== null || mouseHoverR !== null) {
            mouseHoverQ = null;
            mouseHoverR = null;
            if (selectedTile && !isRemovingTiles) { // Only redraw if a tile is selected and not in removal mode
                 updatePlacementHighlights();
            } else if (!selectedTile && !isRemovingTiles) { // If no tile selected, just ensure board is clean
                 redrawBoardOnCanvas();
            }
            // If in removal mode, highlights are managed by isRemovingTiles logic, so no specific action here.
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

    // --- AI Player Logic (Now handled by aiWorker.js) ---
    // Functions like performAiMove, performAiTileRemoval, findBestMoveMinimax, getAllPossibleMoves,
    // evaluateBoard, simulateRemovalCycle, and deepCopyBoardState (for AI simulation purposes)
    // have been moved to aiWorker.js.
    // The main script will now interact with the worker to get AI decisions.

    // Helper function to deep copy board state for non-AI purposes if still needed,
    // or this can be removed if only AI used it.
    // For now, let's assume it might be used by other parts or can be removed later if not.
    function deepCopyBoardState(originalBoardState) {
        const newBoardState = {};
        for (const key in originalBoardState) {
            const tile = originalBoardState[key];
            const newTile = new HexTile(tile.id, tile.playerId, tile.edges);
            newTile.orientation = tile.orientation;
            newTile.x = tile.x;
            newTile.y = tile.y;
            newBoardState[key] = newTile;
        }
        return newBoardState;
    }

});
