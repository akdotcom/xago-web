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

async function calculateGreedyMove(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, isGreedy2, isGreedy3 = false) {
    // Common logic for greedy, greedy2, and greedy3
    await new Promise(resolve => setTimeout(resolve, 500)); // Adjusted delay

    let bestMove = null;

    if (isGreedy3) {
        console.log(`[Worker] AI: Greedy 3 calculating move for Player ${currentPlayerId}.`);
        const depth = 2;

        // Stats for the pruned run (this determines the move)
        const statsPruned = { nodesAtHorizon: 0, cutoffs: 0 };
        const minimaxResultPruned = findBestMoveMinimax(
            boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId,
            depth, -Infinity, Infinity, true, true, statsPruned // useAlphaBetaPruning = true
        );

        let percentageSkipped = 0;
        let totalLeavesWithoutPruning = 0;

        if (statsPruned.nodesAtHorizon > 0) { // Only calculate efficiency if there was something to evaluate
            // Stats for getting total nodes without pruning (for comparison metric)
            const statsNoPruning = { nodesAtHorizon: 0, cutoffs: 0 }; // cutoffs will remain 0
            findBestMoveMinimax(
                boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId,
                depth, -Infinity, Infinity, true, false, statsNoPruning // useAlphaBetaPruning = false
            );
            totalLeavesWithoutPruning = statsNoPruning.nodesAtHorizon;

            if (totalLeavesWithoutPruning > 0) {
                const evaluatedLeavesWithPruning = statsPruned.nodesAtHorizon;
                // Percentage of leaves *not* evaluated thanks to pruning
                percentageSkipped = ((totalLeavesWithoutPruning - evaluatedLeavesWithPruning) / totalLeavesWithoutPruning) * 100;
            }
        }

        if (minimaxResultPruned && minimaxResultPruned.moves && minimaxResultPruned.moves.length > 0) {
            const chosenMinimaxMove = minimaxResultPruned.moves[Math.floor(Math.random() * minimaxResultPruned.moves.length)];
            bestMove = {
                tileId: chosenMinimaxMove.tile.id,
                orientation: chosenMinimaxMove.tile.orientation,
                x: chosenMinimaxMove.x,
                y: chosenMinimaxMove.y,
                score: chosenMinimaxMove.score // This is the score from minimaxResultPruned.score
            };
            console.log(`[Worker] Greedy 3 AI Summary: Chose move for tile ${bestMove.tileId} at (${bestMove.x},${bestMove.y}), orientation ${bestMove.orientation}.`);
            console.log(`    Score: ${bestMove.score}`);
            console.log(`    Strict Pruning Stats: Nodes at horizon: ${statsPruned.nodesAtHorizon}, Cutoffs: ${statsPruned.cutoffs}`);
            console.log(`    Baseline (No Pruning): Total nodes at horizon: ${totalLeavesWithoutPruning}`);
            if (totalLeavesWithoutPruning > 0) {
                console.log(`    Pruning Efficiency: Skipped approx. ${percentageSkipped.toFixed(1)}% of horizon nodes.`);
            } else {
                console.log(`    Pruning Efficiency: Not applicable (no nodes at horizon without pruning).`);
            }
        } else {
            console.log("[Worker] Greedy 3 AI: No valid moves found.");
        }
    } else if (isGreedy2) {
        // console.log("[Worker] AI: Playing Greedily with Lookahead (Greedy 2)");
        // Depth 1 for P2 -> P1
        // TODO: Greedy2 could also benefit from stats if desired, but not requested for now.
        const minimaxResult = findBestMoveMinimax(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, 1, -Infinity, Infinity, true, true); // Standard strict pruning
        if (minimaxResult && minimaxResult.moves && minimaxResult.moves.length > 0) {
            const chosenMinimaxMove = minimaxResult.moves[Math.floor(Math.random() * minimaxResult.moves.length)];
            bestMove = {
                tileId: chosenMinimaxMove.tile.id,
                orientation: chosenMinimaxMove.tile.orientation,
                x: chosenMinimaxMove.x,
                y: chosenMinimaxMove.y,
                score: chosenMinimaxMove.score
            };
        }
    } else { // Greedy 1
        // console.log("[Worker] AI: Playing Greedily (Greedy 1)");
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
                        for (let q_scan = -scanRadius; q_scan <= scanRadius; q_scan++) {
                            for (let r_scan = -scanRadius; r_scan <= scanRadius; r_scan++) {
                                if ((Math.abs(q_scan) + Math.abs(r_scan) + Math.abs(q_scan + r_scan)) / 2 > scanRadius) continue;
                                const spotKey = `${q_scan},${r_scan}`;
                                if (!boardState[spotKey] && !checkedSpots.has(spotKey)) {
                                    placementSpots.push({ x: q_scan, y: r_scan });
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

                        const removalResult = simulateRemovalCycle(tempBoardState, currentPlayerId); // Simulate removals after AI's move
                        const boardAfterSimulatedRemovals = removalResult.boardState;

                        const scores = calculateScoresForBoard(boardAfterSimulatedRemovals);
                        const scoreDiff = (currentPlayerId === 2 ? scores.player2Score - scores.player1Score : scores.player1Score - scores.player2Score);

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
            bestMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
        }
    }
    return bestMove;
}


async function workerPerformAiMove(boardState, player2HandOriginal, player1HandOriginal, opponentType, currentPlayerId) {
    // console.log(`[Worker] performAiMove called. OpponentType: ${opponentType}, P2Hand: ${player2HandOriginal.length}`);
    let bestMove = null;
    const player2Hand = hydrateHand(player2HandOriginal);
    const player1Hand = hydrateHand(player1HandOriginal);
    const opponentPlayerId = (currentPlayerId % 2) + 1;

    if (opponentType === 'random') {
        // console.log("[Worker] AI: Playing Randomly");
        await new Promise(resolve => setTimeout(resolve, 200)); // Short delay for random
        if (player2Hand.length === 0) return null; // No tiles to play
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
            const checkedSpots = new Set();
            for (const key in boardState) {
                const existingTile = boardState[key];
                const neighbors = getNeighbors(existingTile.x, existingTile.y);
                for (const neighborInfo of neighbors) {
                    const spotKey = `${neighborInfo.nx},${neighborInfo.ny}`;
                    if (!boardState[spotKey] && !checkedSpots.has(spotKey)) {
                         if (isPlacementValid(tileToPlay, neighborInfo.nx, neighborInfo.ny, boardState, true)) {
                            possiblePlacements.push({ x: neighborInfo.nx, y: neighborInfo.ny, tile: tileToPlay, orientation: tileToPlay.orientation });
                        }
                        checkedSpots.add(spotKey);
                    }
                }
            }
             if (possiblePlacements.length === 0 && Object.keys(boardState).length < 10 ) { // Broader search if no immediate spots
                const scanRadius = 3;
                 for (let q_scan = -scanRadius; q_scan <= scanRadius; q_scan++) {
                    for (let r_scan = -scanRadius; r_scan <= scanRadius; r_scan++) {
                        if ((Math.abs(q_scan) + Math.abs(r_scan) + Math.abs(q_scan + r_scan)) / 2 > scanRadius) continue;
                        const spotKey = `${q_scan},${r_scan}`;
                        if (!boardState[spotKey] && !checkedSpots.has(spotKey)) {
                            if (isPlacementValid(tileToPlay, q_scan, r_scan, boardState, true)) {
                                possiblePlacements.push({ x: q_scan, y: r_scan, tile: tileToPlay, orientation: tileToPlay.orientation });
                            }
                            checkedSpots.add(spotKey);
                        }
                    }
                }
            }
        }

        if (possiblePlacements.length > 0) {
            const chosenPlacement = possiblePlacements[Math.floor(Math.random() * possiblePlacements.length)];
            bestMove = {
                tileId: chosenPlacement.tile.id,
                orientation: chosenPlacement.orientation,
                x: chosenPlacement.x,
                y: chosenPlacement.y
            };
        }
        tileToPlay.orientation = originalOrientation;

    } else if (opponentType === 'greedy') {
        bestMove = await calculateGreedyMove(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, false, false);
    } else if (opponentType === 'greedy2') {
        bestMove = await calculateGreedyMove(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, true, false);
    } else if (opponentType === 'greedy3') {
        bestMove = await calculateGreedyMove(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, false, true);
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


// Minimax with Alpha-Beta Pruning
// maximizingPlayer is true if it's AI's turn to maximize its score, false if it's opponent's turn (AI minimizes opponent's score from AI's perspective)
function findBestMoveMinimax(currentBoardState, aiHandOriginal, opponentHandOriginal, aiPlayerId, opponentPlayerId, depth, alpha, beta, maximizingPlayer, useAlphaBetaPruning = true, stats = {nodesAtHorizon: 0, cutoffs: 0}) {
    // console.log(`[Worker Minimax P${maximizingPlayer ? aiPlayerId : opponentPlayerId} D${depth} Alpha: ${alpha} Beta: ${beta} Pruning: ${useAlphaBetaPruning}] Entry. AI Hand: ${aiHandOriginal.length}, Opp Hand: ${opponentHandOriginal.length}`);

    if (depth === 0) {
        stats.nodesAtHorizon++;
        const evalScore = evaluateBoard(currentBoardState, aiPlayerId); // Evaluate from AI's perspective
        return { score: evalScore, moves: [] };
    }

    let bestMoves = [];
    // Hydrate hands - crucial to ensure fresh copies and HexTile instances for each simulation path
    const currentMaximizingPlayerHand = maximizingPlayer ? hydrateHand(aiHandOriginal.map(t => ({...t}))) : hydrateHand(opponentHandOriginal.map(t => ({...t})));
    const currentMinimizingPlayerHand = maximizingPlayer ? hydrateHand(opponentHandOriginal.map(t => ({...t}))) : hydrateHand(aiHandOriginal.map(t => ({...t})));

    const currentPlayerForThisTurn = maximizingPlayer ? aiPlayerId : opponentPlayerId;
    const nextPlayerForThisTurn = maximizingPlayer ? opponentPlayerId : aiPlayerId;

    const possibleMoves = getAllPossibleMoves(currentBoardState, currentMaximizingPlayerHand, currentPlayerForThisTurn);

    if (possibleMoves.length === 0) { // No moves for the current player
        const evalScore = evaluateBoard(currentBoardState, aiPlayerId); // Evaluate from AI's perspective
        return { score: evalScore, moves: [] };
    }

    if (maximizingPlayer) {
        let maxEval = -Infinity;
        for (const move of possibleMoves) {
            let boardAfterMove_sim = deepCopyBoardState(currentBoardState);
            const tileForSim = new HexTile(move.tile.id, currentPlayerForThisTurn, [...move.tile.edges]);
            tileForSim.orientation = move.orientation;
            tileForSim.x = move.x;
            tileForSim.y = move.y;
            boardAfterMove_sim[`${move.x},${move.y}`] = tileForSim;

            let handAfterMove_sim = currentMaximizingPlayerHand.filter(t => t.id !== move.tile.id);
            let opponentHandForNext_sim = currentMinimizingPlayerHand.map(t => new HexTile(t.id, t.playerId, [...t.edges])); // Fresh copy

            const removalResult = simulateRemovalCycle(boardAfterMove_sim, currentPlayerForThisTurn);
            boardAfterMove_sim = removalResult.boardState;
            if (removalResult.handGains[currentPlayerForThisTurn]) {
                removalResult.handGains[currentPlayerForThisTurn].forEach(rt => handAfterMove_sim.push(new HexTile(rt.id, rt.playerId, rt.edges)));
            }
            if (removalResult.handGains[nextPlayerForThisTurn]) { // Opponent gains tiles
                removalResult.handGains[nextPlayerForThisTurn].forEach(rt => opponentHandForNext_sim.push(new HexTile(rt.id, rt.playerId, rt.edges)));
            }

            let currentTurnEval;
            if (handAfterMove_sim.length === 0) { // Current player (maximizer) wins
                currentTurnEval = evaluateBoard(boardAfterMove_sim, aiPlayerId) + 1000; // Big bonus
            } else {
                 // Pass aiHandOriginal as the first hand (AI's perspective), opponentHandOriginal as second
                const evalResult = findBestMoveMinimax(boardState, handAfterMove_sim, opponentHandForNext_sim, aiPlayerId, opponentPlayerId, depth - 1, alpha, beta, false, useAlphaBetaPruning, stats); // Pass stats
                currentTurnEval = evalResult.score;
            }

            if (currentTurnEval > maxEval) {
                maxEval = currentTurnEval;
                // For the top-level call (depth corresponding to initial call), store the move.
                // For deeper calls, we only care about the score.
                // The check `depth === (initial_depth_for_greedy3_or_2)` would be better if initial_depth was passed,
                // or assume if it's AI's turn and depth is max, it's the root.
                // For now, always update moves if it's the maximizing player.
                 bestMoves = [{ tile: {id: move.tile.id, orientation: move.orientation}, x: move.x, y: move.y, score: maxEval }];
            } else if (currentTurnEval === maxEval) {
                 bestMoves.push({ tile: {id: move.tile.id, orientation: move.orientation}, x: move.x, y: move.y, score: maxEval });
            }
            alpha = Math.max(alpha, currentTurnEval);
            // Maximizing player: Prune if alpha > beta (explore if alpha == beta)
            if (useAlphaBetaPruning && alpha > beta) {
                stats.cutoffs++;
                break; // Beta cut-off
            }
        }
        return { score: maxEval, moves: bestMoves };
    } else { // Minimizing player (opponent's turn from AI's perspective)
        let minEval = Infinity;
        for (const move of possibleMoves) {
            let boardAfterMove_sim = deepCopyBoardState(currentBoardState);
            const tileForSim = new HexTile(move.tile.id, currentPlayerForThisTurn, [...move.tile.edges]);
            tileForSim.orientation = move.orientation;
            tileForSim.x = move.x;
            tileForSim.y = move.y;
            boardAfterMove_sim[`${move.x},${move.y}`] = tileForSim;

            let handAfterMove_sim = currentMaximizingPlayerHand.filter(t => t.id !== move.tile.id); // This is opponent's hand
            let nextMaximizingHand_sim = currentMinimizingPlayerHand.map(t => new HexTile(t.id, t.playerId, [...t.edges])); // This is AI's hand for next turn

            const removalResult = simulateRemovalCycle(boardAfterMove_sim, currentPlayerForThisTurn);
            boardAfterMove_sim = removalResult.boardState;
            if (removalResult.handGains[currentPlayerForThisTurn]) { // Opponent (current maximizer in this 'else' branch) gains
                removalResult.handGains[currentPlayerForThisTurn].forEach(rt => handAfterMove_sim.push(new HexTile(rt.id, rt.playerId, rt.edges)));
            }
            if (removalResult.handGains[nextPlayerForThisTurn]) { // AI (current minimizer in this 'else' branch) gains
                removalResult.handGains[nextPlayerForThisTurn].forEach(rt => nextMaximizingHand_sim.push(new HexTile(rt.id, rt.playerId, rt.edges)));
            }

            let currentTurnEval;
            if (handAfterMove_sim.length === 0) { // Current player (minimizer/opponent) wins
                currentTurnEval = evaluateBoard(boardAfterMove_sim, aiPlayerId) - 1000; // Big penalty for AI
            } else {
                // Order of hands for next call: AI's hand first, then opponent's hand.
                // So, nextMaximizingHand_sim (AI's hand) then handAfterMove_sim (Opponent's hand)
                const evalResult = findBestMoveMinimax(boardState, nextMaximizingHand_sim, handAfterMove_sim, aiPlayerId, opponentPlayerId, depth - 1, alpha, beta, true, useAlphaBetaPruning, stats); // Pass stats
                currentTurnEval = evalResult.score;
            }

            if (currentTurnEval < minEval) {
                minEval = currentTurnEval;
                // No need to store moves for minimizing player, only its best score.
            }
            beta = Math.min(beta, currentTurnEval);
            // Minimizing player: Prune if beta < alpha (explore if beta == alpha)
            if (useAlphaBetaPruning && beta < alpha) {
                stats.cutoffs++;
                break; // Alpha cut-off
            }
        }
        return { score: minEval, moves: [] }; // moves not used by caller for minimizing player
    }
}


// --- Worker Message Handler ---
self.onmessage = async function(e) { // Made async
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
        const bestMove = await workerPerformAiMove(liveBoardState, player2Hand, player1Hand, opponentType, currentPlayerId); // Added await
        self.postMessage({ task: 'aiMoveResult', move: bestMove });
    } else if (task === 'aiTileRemoval') {
        // currentSurroundedTiles are already plain objects, suitable for workerPerformAiTileRemoval
        // No async operation in workerPerformAiTileRemoval currently, so no await needed here.
        // If it were made async in the future for delays, this would need 'await'.
        const tileToRemove = workerPerformAiTileRemoval(liveBoardState, currentSurroundedTiles, opponentType, currentPlayerId);
        self.postMessage({ task: 'aiTileRemovalResult', tileToRemove: tileToRemove });
    }
};

// console.log('[Worker] AI Worker script fully loaded and message handler set up.');
