// aiWorker.js

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

    getOrientedEdges() {
        const rotatedEdges = [...this.edges];
        for (let i = 0; i < this.orientation; i++) {
            rotatedEdges.unshift(rotatedEdges.pop());
        }
        return rotatedEdges;
    }

    // Not used in worker directly but part of class definition
    get getPlayerColor() {
        return this.playerId === 1 ? 'lightblue' : 'lightcoral';
    }
}

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

const NUM_TILES_PER_PLAYER = 14; // Used in evaluateBoard logic, ensure it's consistent

// --- Game Logic Helper Functions (needed by AI) ---

// Function to get neighbors for a hex grid (axial coordinates)
function getNeighbors(q, r) {
    const axialDirections = [
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
            nx: q + dir.dq,
            ny: r + dir.dr,
            edgeIndexOnNewTile: dir.edgeIndexOnNewTile,
            edgeIndexOnNeighborTile: dir.edgeIndexOnNeighborTile
        });
    }
    return neighbors;
}

// Check if a tile at (q,r) is surrounded
function isTileSurrounded(q, r, currentBoardState) {
    const neighbors = getNeighbors(q, r);
    if (neighbors.length < 6) return false;
    for (const neighborInfo of neighbors) {
        if (!currentBoardState[`${neighborInfo.nx},${neighborInfo.ny}`]) {
            return false;
        }
    }
    return true;
}

// Check if an empty space (q,r) is enclosed by tiles
function isSpaceEnclosed(q, r, currentBoardState) {
    const neighbors = getNeighbors(q, r);
    for (const neighborInfo of neighbors) {
        if (!currentBoardState[`${neighborInfo.nx},${neighborInfo.ny}`]) {
            return false;
        }
    }
    return true;
}

// Get all surrounded tiles on the board
function getSurroundedTiles(currentBoardState) {
    const surroundedTiles = [];
    for (const key in currentBoardState) {
        const tile = currentBoardState[key];
        if (tile.x !== null && tile.y !== null) {
            if (isTileSurrounded(tile.x, tile.y, currentBoardState)) {
                surroundedTiles.push(tile);
            }
        }
    }
    return surroundedTiles;
}

// Validate tile placement
function isPlacementValid(tile, x, y, currentBoardState, isDragOver = false) {
    const targetKey = `${x},${y}`;
    if (currentBoardState[targetKey]) {
        // if (!isDragOver) console.log("[Worker] This cell is already occupied.");
        return false;
    }

    const placedTilesCount = Object.keys(currentBoardState).length;
    const orientedEdges = tile.getOrientedEdges();

    if (placedTilesCount === 0) {
        if (x === 0 && y === 0) {
            // if (!isDragOver) console.log("[Worker] First tile placed at (0,0).");
            return true;
        } else {
            // if (!isDragOver) console.log("[Worker] The first tile must be placed at the center (0,0).");
            return false;
        }
    }

    let touchesExistingTile = false;
    const neighbors = getNeighbors(x, y);
    for (const neighborInfo of neighbors) {
        const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
        const neighborTile = currentBoardState[neighborKey];
        if (neighborTile) {
            touchesExistingTile = true;
            const neighborOrientedEdges = neighborTile.getOrientedEdges(); // Ensure neighborTile is a HexTile instance
            const newTileEdgeType = orientedEdges[neighborInfo.edgeIndexOnNewTile];
            const neighborEdgeType = neighborOrientedEdges[neighborInfo.edgeIndexOnNeighborTile];
            if (newTileEdgeType !== neighborEdgeType) {
                // if (!isDragOver) console.log(`[Worker] Edge mismatch with neighbor at ${nx},${ny}.`);
                return false;
            }
        }
    }

    if (!touchesExistingTile) {
        // if (!isDragOver) console.log("[Worker] Tile must touch an existing tile.");
        return false;
    }
    if (isSpaceEnclosed(x, y, currentBoardState)) {
        // if (!isDragOver) console.log("[Worker] Cannot place tile in an enclosed space.");
        return false;
    }
    // if (!isDragOver) console.log("[Worker] Valid placement.");
    return true;
}

// Calculate scores
function calculateScoresForBoard(currentBoardState) {
    let p1Score = 0;
    let p2Score = 0;
    for (const key in currentBoardState) {
        const tile = currentBoardState[key];
        if (!tile || typeof tile.getOrientedEdges !== 'function' || typeof tile.playerId === 'undefined') {
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
                    if (tile.playerId === 1) p1Score++;
                    else p2Score++;
                }
            }
        }
    }
    return { player1Score: p1Score / 2, player2Score: p2Score / 2 };
}

// Helper function to deep copy board state and tile objects for worker simulation
function deepCopyBoardState(originalBoardState) {
    const newBoardState = {};
    for (const key in originalBoardState) {
        const tileData = originalBoardState[key];
        // Reconstruct HexTile instances for the worker's board state
        const newTile = new HexTile(tileData.id, tileData.playerId, [...tileData.edges]);
        newTile.orientation = tileData.orientation;
        newTile.x = tileData.x;
        newTile.y = tileData.y;
        newBoardState[key] = newTile;
    }
    return newBoardState;
}

function hydrateHand(handData) {
    return handData.map(tileData => {
        const tile = new HexTile(tileData.id, tileData.playerId, [...tileData.edges]);
        tile.orientation = tileData.orientation;
        // x and y are null for hand tiles, so no need to set them from tileData
        return tile;
    });
}


// --- AI Player Logic (to be moved from script.js) ---

function workerPerformAiMove(boardState, player2HandOriginal, player1HandOriginal, opponentType, currentPlayerId) {
    // console.log(`[Worker] performAiMove called. OpponentType: ${opponentType}, P2Hand: ${player2HandOriginal.length}`);
    let bestMove = null;
    const player2Hand = hydrateHand(player2HandOriginal);
    const player1Hand = hydrateHand(player1HandOriginal);

    if (opponentType === 'random') {
        // console.log("[Worker] AI: Playing Randomly");
        const tileToPlay = player2Hand[Math.floor(Math.random() * player2Hand.length)];
        const originalOrientation = tileToPlay.orientation;

        const rotations = Math.floor(Math.random() * 6);
        for (let i = 0; i < rotations; i++) {
            tileToPlay.rotate();
        }

        const possiblePlacements = [];
        if (Object.keys(boardState).length === 0) {
            if (isPlacementValid(tileToPlay, 0, 0, boardState, true)) {
                 possiblePlacements.push({ x: 0, y: 0, tile: tileToPlay, orientation: tileToPlay.orientation });
            }
        } else {
            for (const key in boardState) {
                const existingTile = boardState[key];
                const neighbors = getNeighbors(existingTile.x, existingTile.y);
                for (const neighborInfo of neighbors) {
                    const potentialPos = { x: neighborInfo.nx, y: neighborInfo.ny };
                    if (!boardState[`${potentialPos.x},${potentialPos.y}`]) {
                        if (isPlacementValid(tileToPlay, potentialPos.x, potentialPos.y, boardState, true)) {
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
            const chosenPlacement = uniquePlacements[Math.floor(Math.random() * uniquePlacements.length)];
            bestMove = {
                tileId: chosenPlacement.tile.id,
                orientation: chosenPlacement.orientation, // This was tileToPlay.orientation from the placement
                x: chosenPlacement.x,
                y: chosenPlacement.y
            };
        }
        tileToPlay.orientation = originalOrientation; // Restore

    } else if (opponentType === 'greedy') {
        // console.log("[Worker] AI: Playing Greedily");
        let bestScoreDiff = -Infinity;
        let bestMoves = [];

        for (const tile of player2Hand) {
            const originalOrientation = tile.orientation;
            for (let o = 0; o < 6; o++) {
                tile.orientation = o;
                const placementSpots = [];
                if (Object.keys(boardState).length === 0) {
                    placementSpots.push({ x: 0, y: 0 });
                } else {
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
                     if (placementSpots.length === 0 && Object.keys(boardState).length < 5) {
                        const scanRadius = 3;
                        for (let q = -scanRadius; q <= scanRadius; q++) {
                            for (let r = -scanRadius; r <= scanRadius; r++) {
                                 // Corrected condition for axial hex radius
                                 if ((Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2 > scanRadius) continue;
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
                    if (isPlacementValid(tile, pos.x, pos.y, boardState, true)) {
                        const tempBoardState = deepCopyBoardState(boardState);
                        const simTile = new HexTile(tile.id, tile.playerId, tile.edges);
                        simTile.orientation = tile.orientation;
                        simTile.x = pos.x;
                        simTile.y = pos.y;
                        tempBoardState[`${pos.x},${pos.y}`] = simTile;

                        let boardAfterSimulatedRemovals = deepCopyBoardState(tempBoardState);
                        let simulatedSurroundedTiles = getSurroundedTiles(boardAfterSimulatedRemovals);
                        while (simulatedSurroundedTiles.length > 0) {
                            let tileToSimulateRemove = null;
                            const opponentSimTiles = simulatedSurroundedTiles.filter(t => t.playerId !== currentPlayerId);
                            if (opponentSimTiles.length > 0) {
                                tileToSimulateRemove = opponentSimTiles[0];
                            } else {
                                const ownSimTiles = simulatedSurroundedTiles.filter(t => t.playerId === currentPlayerId);
                                if (ownSimTiles.length > 0) {
                                    tileToSimulateRemove = ownSimTiles[0];
                                }
                            }
                            if (tileToSimulateRemove) {
                                delete boardAfterSimulatedRemovals[`${tileToSimulateRemove.x},${tileToSimulateRemove.y}`];
                                simulatedSurroundedTiles = getSurroundedTiles(boardAfterSimulatedRemovals);
                            } else {
                                break;
                            }
                        }
                        const scores = calculateScoresForBoard(boardAfterSimulatedRemovals);
                        const scoreDiff = scores.player2Score - scores.player1Score;
                        if (scoreDiff > bestScoreDiff) {
                            bestScoreDiff = scoreDiff;
                            bestMoves = [{ tileId: tile.id, orientation: tile.orientation, x: pos.x, y: pos.y, score: scoreDiff }];
                        } else if (scoreDiff === bestScoreDiff) {
                            bestMoves.push({ tileId: tile.id, orientation: tile.orientation, x: pos.x, y: pos.y, score: scoreDiff });
                        }
                    }
                }
            }
            tile.orientation = originalOrientation;
        }
        if (bestMoves.length > 0) {
            // bestMove is already in the desired format {tileId, orientation, x, y, score}
            bestMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
        }


    } else if (opponentType === 'greedy2') {
        // console.log("[Worker] AI: Playing Greedily with Lookahead (Greedy 2)");
        const minimaxResult = findBestMoveMinimax(boardState, player2Hand, player1Hand, currentPlayerId, (currentPlayerId % 2) + 1, 1); // depth 1
        if (minimaxResult && minimaxResult.moves && minimaxResult.moves.length > 0) {
            const chosenMinimaxMove = minimaxResult.moves[Math.floor(Math.random() * minimaxResult.moves.length)];
            // Transform the structure from findBestMoveMinimax
            bestMove = {
                tileId: chosenMinimaxMove.tile.id,
                orientation: chosenMinimaxMove.tile.orientation,
                x: chosenMinimaxMove.x,
                y: chosenMinimaxMove.y,
                score: chosenMinimaxMove.score // Keep score if needed for debugging or future use
            };
        }
    }

    // console.log("[Worker] performAiMove result:", bestMove);
    return bestMove;
}

function workerPerformAiTileRemoval(boardState, currentSurroundedTilesData, opponentType, currentPlayerId) {
    // console.log(`[Worker] performAiTileRemoval called. OpponentType: ${opponentType}, SurrTiles: ${currentSurroundedTilesData.length}`);
    let tileToRemove = null;
    // No need to hydrate currentSurroundedTilesData if we only need id, x, y, playerId for decision making.
    // If methods of HexTile were needed on these, they would need hydration.

    if (opponentType === 'random') {
        const opponentTiles = currentSurroundedTilesData.filter(t => t.playerId !== currentPlayerId);
        if (opponentTiles.length > 0) {
            tileToRemove = opponentTiles[Math.floor(Math.random() * opponentTiles.length)];
        } else if (currentSurroundedTilesData.length > 0) {
            tileToRemove = currentSurroundedTilesData[Math.floor(Math.random() * currentSurroundedTilesData.length)];
        }
    } else if (opponentType === 'greedy' || opponentType === 'greedy2') { // Greedy2 can use same simple logic for now
        const opponentTiles = currentSurroundedTilesData.filter(t => t.playerId !== currentPlayerId);
        if (opponentTiles.length > 0) {
            tileToRemove = opponentTiles[0]; // Simple: remove the first opponent tile
             if (opponentType === 'greedy2') { // More sophisticated for greedy2
                let bestChoice = null;
                let bestScore = -Infinity;
                for (const oppTile of opponentTiles) {
                    const tempBoard = deepCopyBoardState(boardState); // Ensure boardState is a proper HexTile map
                    delete tempBoard[`${oppTile.x},${oppTile.y}`];
                    const score = evaluateBoard(tempBoard, currentPlayerId);
                    if (score > bestScore) {
                        bestScore = score;
                        bestChoice = oppTile;
                    }
                }
                tileToRemove = bestChoice;
            }
        } else if (currentSurroundedTilesData.length > 0) {
            tileToRemove = currentSurroundedTilesData[0]; // Simple: remove the first of our own tiles
            if (opponentType === 'greedy2' && currentSurroundedTilesData.filter(t => t.playerId === currentPlayerId).length > 0) {
                 let bestChoice = null;
                let bestScore = -Infinity; // AI wants to maximize its score even when removing its own tile
                const ownTiles = currentSurroundedTilesData.filter(t => t.playerId === currentPlayerId);
                for (const ownTile of ownTiles) {
                    const tempBoard = deepCopyBoardState(boardState);
                    delete tempBoard[`${ownTile.x},${ownTile.y}`];
                    const score = evaluateBoard(tempBoard, currentPlayerId);
                    if (score > bestScore) {
                        bestScore = score;
                        bestChoice = ownTile;
                    }
                }
                tileToRemove = bestChoice;
            }
        }
    }

    // console.log("[Worker] performAiTileRemoval result:", tileToRemove ? {id: tileToRemove.id, x: tileToRemove.x, y: tileToRemove.y} : null);
    // Return only necessary info (id, x, y) for the main thread to find and remove the tile
    return tileToRemove ? { id: tileToRemove.id, x: tileToRemove.x, y: tileToRemove.y, playerId: tileToRemove.playerId } : null;
}


// --- Minimax AI Helper Functions (copied from script.js) ---
function getAllPossibleMoves(currentBoardState, hand, playerId) {
    const possibleMoves = [];
    const initialBoardIsEmpty = Object.keys(currentBoardState).length === 0;

    for (const tile of hand) { // hand is already hydrated HexTile objects
        const originalOrientation = tile.orientation;
        for (let o = 0; o < 6; o++) {
            tile.orientation = o;
            if (initialBoardIsEmpty) {
                if (isPlacementValid(tile, 0, 0, currentBoardState, true)) {
                    possibleMoves.push({ tile: {id: tile.id, playerId: tile.playerId, edges: tile.edges}, orientation: o, x: 0, y: 0, playerId: playerId });
                }
            } else {
                const placementSpots = new Set();
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
                 if (placementSpots.size === 0 && Object.keys(currentBoardState).length < 5 && Object.keys(currentBoardState).length > 0) {
                        const scanRadius = 3;
                        for (let q = -scanRadius; q <= scanRadius; q++) {
                            for (let r = -scanRadius; r <= scanRadius; r++) {
                                // Corrected condition for axial hex radius
                                if ((Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2 > scanRadius) continue;
                                const spotKey = `${q},${r}`;
                                if (!currentBoardState[spotKey]) {
                                    placementSpots.add(spotKey);
                                }
                            }
                        }
                    }
                for (const spotKey of placementSpots) {
                    const [x, y] = spotKey.split(',').map(Number);
                    if (isPlacementValid(tile, x, y, currentBoardState, true)) {
                        possibleMoves.push({ tile: {id: tile.id, playerId: tile.playerId, edges: tile.edges}, orientation: o, x: x, y: y, playerId: playerId });
                    }
                }
            }
        }
        tile.orientation = originalOrientation;
    }
    return possibleMoves;
}

function evaluateBoard(currentBoardState, playerPerspectiveId) {
    // console.log(`[Worker evaluateBoard] perspective: ${playerPerspectiveId}, board keys: ${Object.keys(currentBoardState).length}`);
    // Accessing player1Hand/player2Hand from global scope of worker is problematic.
    // This function should ideally not depend on global hand states if they are not passed or reconstructed.
    // For now, assume this NUM_TILES_PER_PLAYER check is a minor heuristic.
    if (Object.keys(currentBoardState).length === 0 && playerPerspectiveId === 2 /* && player1Hand.length === NUM_TILES_PER_PLAYER */) {
        // console.log("[Worker evaluateBoard] Penalizing P2 for not making first move.");
        return -1000;
    }
    if (Object.keys(currentBoardState).length === 0 && playerPerspectiveId === 1) {
        // console.log("[Worker evaluateBoard] Neutral score for P1 on empty board.");
        return 0;
    }

    const scores = calculateScoresForBoard(currentBoardState);
    let evalScore;
    if (playerPerspectiveId === 1) {
        evalScore = scores.player1Score - scores.player2Score;
    } else {
        evalScore = scores.player2Score - scores.player1Score;
    }
    // console.log(`[Worker evaluateBoard] P${playerPerspectiveId} perspective. P1Score: ${scores.player1Score}, P2Score: ${scores.player2Score}. Eval: ${evalScore}`);
    return evalScore;
}


function simulateRemovalCycle(initialBoardState, actingPlayerId) {
    let currentSimBoardState = deepCopyBoardState(initialBoardState);
    let tilesReturnedToHands = {};
    let iteration = 0;

    while (true) {
        iteration++;
        const surroundedTiles = getSurroundedTiles(currentSimBoardState);
        if (surroundedTiles.length === 0) break;

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
            tileToRemove = ownTilesSurrounded[0]; // Simplified: pick first own tile
        }

        if (tileToRemove) {
            delete currentSimBoardState[`${tileToRemove.x},${tileToRemove.y}`];
            if (!tilesReturnedToHands[tileToRemove.playerId]) {
                tilesReturnedToHands[tileToRemove.playerId] = [];
            }
            tilesReturnedToHands[tileToRemove.playerId].push({
                id: tileToRemove.id,
                playerId: tileToRemove.playerId,
                edges: [...tileToRemove.edges] // Store necessary data to reconstruct HexTile if needed
            });
        } else {
            break;
        }
        if (iteration > 10) break; // Safety break
    }
    return { boardState: currentSimBoardState, handGains: tilesReturnedToHands };
}


function findBestMoveMinimax(currentBoardState, aiHandOriginal, opponentHandOriginal, aiPlayerId, opponentPlayerId, depth) {
    // console.log(`[Worker Minimax P${aiPlayerId} D${depth}] Entry. AI Hand: ${aiHandOriginal.length}, Opp Hand: ${opponentHandOriginal.length}`);

    if (depth === 0) {
        const evalScore = evaluateBoard(currentBoardState, aiPlayerId);
        // console.log(`[Worker Minimax P${aiPlayerId} D${depth}] Base Case (depth 0). Eval score: ${evalScore}`);
        return { score: evalScore, moves: [] };
    }

    let bestMovesForAi = [];
    let maxScoreForAi = -Infinity;

    // Hydrate hands at the beginning of each call, or ensure they are passed as HexTile instances
    const aiHand = hydrateHand(aiHandOriginal.map(t => ({...t}))); // Ensure fresh copies for modification
    const opponentHand = hydrateHand(opponentHandOriginal.map(t => ({...t})));


    const possibleAiMoves = getAllPossibleMoves(currentBoardState, aiHand, aiPlayerId);
    // console.log(`[Worker Minimax P${aiPlayerId} D${depth}] Found ${possibleAiMoves.length} possible moves for AI.`);

    if (possibleAiMoves.length === 0) {
        const evalScore = evaluateBoard(currentBoardState, aiPlayerId);
        // console.log(`[Worker Minimax P${aiPlayerId} D${depth}] Base Case (no AI moves). Eval score: ${evalScore}`);
        return { score: evalScore, moves: [] };
    }

    for (const aiMove of possibleAiMoves) { // aiMove.tile is {id, playerId, edges}
        let boardAfterAiMove_sim = deepCopyBoardState(currentBoardState);
        const aiTileForSim = new HexTile(aiMove.tile.id, aiPlayerId, [...aiMove.tile.edges]);
        aiTileForSim.orientation = aiMove.orientation;
        aiTileForSim.x = aiMove.x;
        aiTileForSim.y = aiMove.y;
        boardAfterAiMove_sim[`${aiMove.x},${aiMove.y}`] = aiTileForSim;

        let currentAiHandSim = aiHand.filter(t => t.id !== aiMove.tile.id);
        let currentOpponentHandSim = opponentHand.map(t => new HexTile(t.id, t.playerId, [...t.edges]));

        const removalResultAi = simulateRemovalCycle(boardAfterAiMove_sim, aiPlayerId);
        boardAfterAiMove_sim = removalResultAi.boardState;

        if (removalResultAi.handGains[aiPlayerId]) {
            removalResultAi.handGains[aiPlayerId].forEach(rt => currentAiHandSim.push(new HexTile(rt.id, rt.playerId, rt.edges)));
        }
        if (removalResultAi.handGains[opponentPlayerId]) {
            removalResultAi.handGains[opponentPlayerId].forEach(rt => currentOpponentHandSim.push(new HexTile(rt.id, rt.playerId, rt.edges)));
        }

        if (currentAiHandSim.length === 0) { // AI wins
            const score = evaluateBoard(boardAfterAiMove_sim, aiPlayerId) + 1000;
            if (score > maxScoreForAi) {
                maxScoreForAi = score;
                bestMovesForAi = [{ tile: {id: aiMove.tile.id, orientation: aiMove.orientation}, x: aiMove.x, y: aiMove.y, score: maxScoreForAi }];
            } else if (score === maxScoreForAi) {
                bestMovesForAi.push({ tile: {id: aiMove.tile.id, orientation: aiMove.orientation}, x: aiMove.x, y: aiMove.y, score: maxScoreForAi });
            }
            continue;
        }

        let minScoreAfterOpponentResponse = Infinity;
        const possibleOpponentMoves = getAllPossibleMoves(boardAfterAiMove_sim, currentOpponentHandSim, opponentPlayerId);

        if (possibleOpponentMoves.length === 0 || currentOpponentHandSim.length === 0) {
            minScoreAfterOpponentResponse = evaluateBoard(boardAfterAiMove_sim, aiPlayerId);
            if (currentOpponentHandSim.length === 0) minScoreAfterOpponentResponse -=1000; // Opponent lost
        } else {
            for (const opponentMove of possibleOpponentMoves) {
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

                if (removalResultOpponent.handGains[opponentPlayerId]) {
                    removalResultOpponent.handGains[opponentPlayerId].forEach(rt => simOpponentHandAfterMove.push(new HexTile(rt.id, rt.playerId, rt.edges)));
                }
                if (removalResultOpponent.handGains[aiPlayerId]) {
                    removalResultOpponent.handGains[aiPlayerId].forEach(rt => simAiHandForNextTurn.push(new HexTile(rt.id, rt.playerId, rt.edges)));
                }

                let currentTurnScore;
                if (simOpponentHandAfterMove.length === 0) { // Opponent wins
                    currentTurnScore = evaluateBoard(boardAfterOpponentMove_sim, aiPlayerId) - 1000;
                } else if (depth - 1 === 0) {
                    currentTurnScore = evaluateBoard(boardAfterOpponentMove_sim, aiPlayerId);
                } else {
                    const nextState = findBestMoveMinimax(boardAfterOpponentMove_sim, simAiHandForNextTurn, simOpponentHandAfterMove, aiPlayerId, opponentPlayerId, depth - 1);
                    currentTurnScore = nextState.score;
                }
                if (currentTurnScore < minScoreAfterOpponentResponse) {
                    minScoreAfterOpponentResponse = currentTurnScore;
                }
            }
        }

        if (minScoreAfterOpponentResponse > maxScoreForAi) {
            maxScoreForAi = minScoreAfterOpponentResponse;
            bestMovesForAi = [{ tile: {id: aiMove.tile.id, orientation: aiMove.orientation}, x: aiMove.x, y: aiMove.y, score: maxScoreForAi }];
        } else if (minScoreAfterOpponentResponse === maxScoreForAi) {
            bestMovesForAi.push({ tile: {id: aiMove.tile.id, orientation: aiMove.orientation}, x: aiMove.x, y: aiMove.y, score: maxScoreForAi });
        }
    }
    // console.log(`[Worker Minimax P${aiPlayerId} D${depth}] Exit. Best score ${maxScoreForAi}, ${bestMovesForAi.length} moves.`);
    return { score: maxScoreForAi, moves: bestMovesForAi };
}


// --- Worker Message Handler ---
self.onmessage = function(e) {
    // console.log('[Worker] Message received from main script:', e.data);
    const { task, boardState, player2Hand, player1Hand, opponentType, currentPlayerId, currentSurroundedTiles } = e.data;

    // Reconstruct HexTile instances for boardState from simple data objects
    const liveBoardState = {};
    for (const key in boardState) {
        const tileData = boardState[key];
        const tile = new HexTile(tileData.id, tileData.playerId, [...tileData.edges]);
        tile.orientation = tileData.orientation;
        tile.x = tileData.x;
        tile.y = tileData.y;
        liveBoardState[key] = tile;
    }

    // Player hands are arrays of simple data objects, they will be hydrated inside AI functions if needed by HexTile methods.
    // currentSurroundedTiles are also simple data objects.

    if (task === 'aiMove') {
        const bestMove = workerPerformAiMove(liveBoardState, player2Hand, player1Hand, opponentType, currentPlayerId);
        self.postMessage({ task: 'aiMoveResult', move: bestMove });
    } else if (task === 'aiTileRemoval') {
        // currentSurroundedTiles are already plain objects, suitable for workerPerformAiTileRemoval
        const tileToRemove = workerPerformAiTileRemoval(liveBoardState, currentSurroundedTiles, opponentType, currentPlayerId);
        self.postMessage({ task: 'aiTileRemovalResult', tileToRemove: tileToRemove });
    }
};

// console.log('[Worker] AI Worker script fully loaded and message handler set up.');
