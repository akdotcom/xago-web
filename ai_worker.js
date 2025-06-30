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

    // Method to get edges considering current orientation
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

// --- Game Logic Helper Functions (to be used by AI) ---

// Uses axial coordinates (q, r) for flat-topped hexagons.
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

function isSpaceEnclosed(q, r, currentBoardState) {
    const neighbors = getNeighbors(q, r);
    for (const neighborInfo of neighbors) {
        const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
        if (!currentBoardState[neighborKey]) {
            return false;
        }
    }
    return true;
}

function isPlacementValid(tile, x, y, currentBoardState, isDragOver = false) { // Added currentBoardState parameter
    const targetKey = `${x},${y}`;
    if (currentBoardState[targetKey]) {
        // console.log("Worker: This cell is already occupied.");
        return false;
    }

    const placedTilesCount = Object.keys(currentBoardState).length;
    const orientedEdges = tile.getOrientedEdges();

    if (placedTilesCount === 0) {
        return x === 0 && y === 0;
    }

    let touchesExistingTile = false;
    const neighbors = getNeighbors(x, y);

    for (const neighborInfo of neighbors) {
        const {nx, ny, edgeIndexOnNewTile, edgeIndexOnNeighborTile} = neighborInfo;
        const neighborKey = `${nx},${ny}`;
        const neighborTileData = currentBoardState[neighborKey];

        if (neighborTileData) {
            touchesExistingTile = true;
            // Reconstruct neighborTile to use its methods if needed, or access edges directly
            const neighborTile = new HexTile(neighborTileData.id, neighborTileData.playerId, neighborTileData.edges);
            neighborTile.orientation = neighborTileData.orientation;
            const neighborOrientedEdges = neighborTile.getOrientedEdges();
            const newTileEdgeType = orientedEdges[edgeIndexOnNewTile];
            const neighborEdgeType = neighborOrientedEdges[edgeIndexOnNeighborTile];

            if (newTileEdgeType !== neighborEdgeType) {
                // console.log(`Worker: Edge mismatch with neighbor at ${nx},${ny}.`);
                return false;
            }
        }
    }

    if (!touchesExistingTile) {
        // console.log("Worker: Tile must touch an existing tile.");
        return false;
    }

    if (isSpaceEnclosed(x, y, currentBoardState)) {
        // console.log("Worker: Cannot place tile in an enclosed space.");
        return false;
    }
    return true;
}

function isTileSurrounded(q, r, currentBoardState) {
    const neighbors = getNeighbors(q, r);
    if (neighbors.length < 6) return false;
    for (const neighborInfo of neighbors) {
        const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
        if (!currentBoardState[neighborKey]) {
            return false;
        }
    }
    return true;
}

function getSurroundedTiles(currentBoardState) {
    const surroundedTiles = [];
    for (const key in currentBoardState) {
        const tileData = currentBoardState[key];
        // Create a HexTile instance to correctly use its properties and methods
        const tile = new HexTile(tileData.id, tileData.playerId, tileData.edges);
        tile.orientation = tileData.orientation;
        tile.x = tileData.x;
        tile.y = tileData.y;

        if (tile.x !== null && tile.y !== null) {
            if (isTileSurrounded(tile.x, tile.y, currentBoardState)) {
                surroundedTiles.push(tile); // Store the instance
            }
        }
    }
    return surroundedTiles;
}

function calculateScoresForBoard(currentBoardState) {
    let p1Score = 0;
    let p2Score = 0;

    for (const key in currentBoardState) {
        const tileData = currentBoardState[key];
        const tile = new HexTile(tileData.id, tileData.playerId, tileData.edges);
        tile.orientation = tileData.orientation;
        tile.x = tileData.x;
        tile.y = tileData.y;

        if (!tile || typeof tile.getOrientedEdges !== 'function' || typeof tile.playerId === 'undefined') {
            continue;
        }
        const { x, y } = tile;
        const orientedEdges = tile.getOrientedEdges();
        const neighbors = getNeighbors(x, y);

        for (const neighborInfo of neighbors) {
            const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
            const neighborTileData = currentBoardState[neighborKey];

            if (neighborTileData) {
                const neighborTile = new HexTile(neighborTileData.id, neighborTileData.playerId, neighborTileData.edges);
                neighborTile.orientation = neighborTileData.orientation;

                if (typeof neighborTile.getOrientedEdges === 'function' && neighborTile.playerId === tile.playerId) {
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
    }
    return { player1Score: p1Score / 2, player2Score: p2Score / 2 };
}

function deepCopyBoardState(originalBoardState) {
    const newBoardState = {};
    for (const key in originalBoardState) {
        const tile = originalBoardState[key];
        // Store plain data; HexTile instances will be created as needed
        newBoardState[key] = {
            id: tile.id,
            playerId: tile.playerId,
            edges: [...tile.edges],
            orientation: tile.orientation,
            x: tile.x,
            y: tile.y
        };
    }
    return newBoardState;
}

function evaluateBoard(currentBoardState, playerPerspectiveId) {
    // Simplified initial check for worker context
    if (Object.keys(currentBoardState).length === 0 && playerPerspectiveId === 2) return -1000;
    if (Object.keys(currentBoardState).length === 0 && playerPerspectiveId === 1) return 0;

    const scores = calculateScoresForBoard(currentBoardState);
    if (playerPerspectiveId === 1) {
        return scores.player1Score - scores.player2Score;
    } else {
        return scores.player2Score - scores.player1Score;
    }
}

function getAllPossibleMoves(currentBoardState, handData, playerId) {
    const possibleMoves = [];
    const initialBoardIsEmpty = Object.keys(currentBoardState).length === 0;

    for (const tileData of handData) {
        const tile = new HexTile(tileData.id, tileData.playerId, tileData.edges);
        tile.orientation = tileData.orientation; // Use current orientation from hand

        const originalOrientation = tile.orientation;
        for (let o = 0; o < 6; o++) {
            tile.orientation = o;
            if (initialBoardIsEmpty) {
                if (isPlacementValid(tile, 0, 0, currentBoardState, true)) {
                    possibleMoves.push({ tile: tileData, orientation: o, x: 0, y: 0, playerId: playerId });
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
                    if (isPlacementValid(tile, x, y, currentBoardState, true)) {
                        possibleMoves.push({ tile: tileData, orientation: o, x: x, y: y, playerId: playerId });
                    }
                }
            }
        }
        tile.orientation = originalOrientation; // Restore for safety, though tileData is used
    }
    return possibleMoves;
}

function simulateRemovalCycle(initialBoardState, actingPlayerId) {
    let currentSimBoardState = deepCopyBoardState(initialBoardState);
    let tilesReturnedToHands = {};
    let iteration = 0;

    while (true) {
        iteration++;
        const surroundedTilesData = getSurroundedTiles(currentSimBoardState); // Returns HexTile instances
        if (surroundedTilesData.length === 0) break;

        let tileToRemoveInstance = null;
        const opponentTilesSurrounded = surroundedTilesData.filter(t => t.playerId !== actingPlayerId);
        const ownTilesSurrounded = surroundedTilesData.filter(t => t.playerId === actingPlayerId);

        if (opponentTilesSurrounded.length > 0) {
            let bestRemovalChoice = null;
            let maxScoreAfterRemoval = -Infinity;
            for (const oppTile of opponentTilesSurrounded) { // oppTile is HexTile instance
                const tempBoard = deepCopyBoardState(currentSimBoardState);
                delete tempBoard[`${oppTile.x},${oppTile.y}`];
                const score = evaluateBoard(tempBoard, actingPlayerId);
                if (score > maxScoreAfterRemoval) {
                    maxScoreAfterRemoval = score;
                    bestRemovalChoice = oppTile;
                }
            }
            tileToRemoveInstance = bestRemovalChoice;
        } else if (ownTilesSurrounded.length > 0) {
            tileToRemoveInstance = ownTilesSurrounded[0];
        }

        if (tileToRemoveInstance) {
            delete currentSimBoardState[`${tileToRemoveInstance.x},${tileToRemoveInstance.y}`];
            if (!tilesReturnedToHands[tileToRemoveInstance.playerId]) {
                tilesReturnedToHands[tileToRemoveInstance.playerId] = [];
            }
            tilesReturnedToHands[tileToRemoveInstance.playerId].push({
                id: tileToRemoveInstance.id,
                playerId: tileToRemoveInstance.playerId,
                edges: [...tileToRemoveInstance.edges] // Store plain data
            });
        } else {
            break;
        }
        if (iteration > 10) break;
    }
    return { boardState: currentSimBoardState, handGains: tilesReturnedToHands };
}

function findBestMoveMinimax(currentBoardState, aiHandData, opponentHandData, aiPlayerId, opponentPlayerId, depth) {
    if (depth === 0) {
        return { score: evaluateBoard(currentBoardState, aiPlayerId), moves: [] };
    }

    let bestMovesForAi = [];
    let maxScoreForAi = -Infinity;

    // Convert data to HexTile instances for logic, but pass data around
    const aiHand = aiHandData.map(td => new HexTile(td.id, td.playerId, td.edges));
    aiHand.forEach((tile, idx) => tile.orientation = aiHandData[idx].orientation);

    const opponentHand = opponentHandData.map(td => new HexTile(td.id, td.playerId, td.edges));
    opponentHand.forEach((tile, idx) => tile.orientation = opponentHandData[idx].orientation);


    const possibleAiMoves = getAllPossibleMoves(currentBoardState, aiHandData, aiPlayerId);

    if (possibleAiMoves.length === 0) {
        return { score: evaluateBoard(currentBoardState, aiPlayerId), moves: [] };
    }

    for (const aiMove of possibleAiMoves) { // aiMove contains tileData
        let boardAfterAiMove_sim = deepCopyBoardState(currentBoardState);
        const aiTileForSimData = aiMove.tile; // This is already plain data from getAllPossibleMoves
        const aiTileForSim = new HexTile(aiTileForSimData.id, aiPlayerId, aiTileForSimData.edges);
        aiTileForSim.orientation = aiMove.orientation;
        aiTileForSim.x = aiMove.x;
        aiTileForSim.y = aiMove.y;
        boardAfterAiMove_sim[`${aiMove.x},${aiMove.y}`] = aiTileForSim; // Store instance for logic within this loop

        let currentAiHandSimData = aiHandData.filter(t => t.id !== aiMove.tile.id);
        let currentOpponentHandSimData = opponentHandData.map(t => ({ ...t, edges: [...t.edges] }));

        const removalResultAi = simulateRemovalCycle(boardAfterAiMove_sim, aiPlayerId);
        boardAfterAiMove_sim = removalResultAi.boardState;

        if (removalResultAi.handGains[aiPlayerId]) {
            removalResultAi.handGains[aiPlayerId].forEach(rt => currentAiHandSimData.push(rt));
        }
        if (removalResultAi.handGains[opponentPlayerId]) {
            removalResultAi.handGains[opponentPlayerId].forEach(rt => currentOpponentHandSimData.push(rt));
        }

        if (currentAiHandSimData.length === 0) {
            const score = evaluateBoard(boardAfterAiMove_sim, aiPlayerId) + 1000;
            if (score > maxScoreForAi) {
                maxScoreForAi = score;
                bestMovesForAi = [{ ...aiMove, score: maxScoreForAi }];
            } else if (score === maxScoreForAi) {
                bestMovesForAi.push({ ...aiMove, score: maxScoreForAi });
            }
            continue;
        }

        let minScoreAfterOpponentResponse = Infinity;
        const possibleOpponentMoves = getAllPossibleMoves(boardAfterAiMove_sim, currentOpponentHandSimData, opponentPlayerId);

        if (possibleOpponentMoves.length === 0 || currentOpponentHandSimData.length === 0) {
            minScoreAfterOpponentResponse = evaluateBoard(boardAfterAiMove_sim, aiPlayerId);
            if (currentOpponentHandSimData.length === 0) minScoreAfterOpponentResponse -=1000;
        } else {
            for (const opponentMove of possibleOpponentMoves) { // opponentMove contains tileData
                let boardAfterOpponentMove_sim = deepCopyBoardState(boardAfterAiMove_sim);
                const opponentTileForSimData = opponentMove.tile;
                const opponentTileForSim = new HexTile(opponentTileForSimData.id, opponentPlayerId, opponentTileForSimData.edges);
                opponentTileForSim.orientation = opponentMove.orientation;
                opponentTileForSim.x = opponentMove.x;
                opponentTileForSim.y = opponentMove.y;
                boardAfterOpponentMove_sim[`${opponentMove.x},${opponentMove.y}`] = opponentTileForSim;

                let simOpponentHandAfterMoveData = currentOpponentHandSimData.filter(t => t.id !== opponentMove.tile.id);
                let simAiHandForNextTurnData = currentAiHandSimData.map(t => ({ ...t, edges: [...t.edges] }));

                const removalResultOpponent = simulateRemovalCycle(boardAfterOpponentMove_sim, opponentPlayerId);
                boardAfterOpponentMove_sim = removalResultOpponent.boardState;

                if (removalResultOpponent.handGains[opponentPlayerId]) {
                    removalResultOpponent.handGains[opponentPlayerId].forEach(rt => simOpponentHandAfterMoveData.push(rt));
                }
                if (removalResultOpponent.handGains[aiPlayerId]) {
                    removalResultOpponent.handGains[aiPlayerId].forEach(rt => simAiHandForNextTurnData.push(rt));
                }

                let currentTurnScore;
                if (simOpponentHandAfterMoveData.length === 0) {
                    currentTurnScore = evaluateBoard(boardAfterOpponentMove_sim, aiPlayerId) - 1000;
                } else if (depth - 1 === 0) {
                    currentTurnScore = evaluateBoard(boardAfterOpponentMove_sim, aiPlayerId);
                } else {
                    const nextState = findBestMoveMinimax(boardAfterOpponentMove_sim, simAiHandForNextTurnData, simOpponentHandAfterMoveData, aiPlayerId, opponentPlayerId, depth - 1);
                    currentTurnScore = nextState.score;
                }
                if (currentTurnScore < minScoreAfterOpponentResponse) {
                    minScoreAfterOpponentResponse = currentTurnScore;
                }
            }
        }

        if (minScoreAfterOpponentResponse > maxScoreForAi) {
            maxScoreForAi = minScoreAfterOpponentResponse;
            bestMovesForAi = [{ ...aiMove, score: maxScoreForAi }]; // aiMove already contains plain tileData
        } else if (minScoreAfterOpponentResponse === maxScoreForAi) {
            bestMovesForAi.push({ ...aiMove, score: maxScoreForAi });
        }
    }
    return { score: maxScoreForAi, moves: bestMovesForAi };
}


// --- Main Worker Message Handler ---
self.onmessage = function(event) {
    const { taskType, boardState: boardStateData, playerHand: playerHandData, opponentHand: opponentHandData, currentPlayerId, opponentType, currentSurroundedTilesForRemoval: currentSurroundedTilesData } = event.data;

    // Reconstruct boardState with HexTile instances if methods are needed by logic,
    // otherwise, plain data is fine if functions are adapted.
    // For now, functions like getSurroundedTiles will create instances as needed.
    // The boardStateData is assumed to be { 'x,y': tilePlainDataObject, ... }
    // Player hands are arrays of plain tile data objects.

    if (taskType === 'move') {
        let bestMove = null; // Structure: { tile: tileData, orientation: number, x: number, y: number, score?: number }
        const aiPlayerId = currentPlayerId; // Should be 2

        // Reconstruct playerHand from playerHandData for logic if needed (e.g. for random AI)
        const playerHand = playerHandData.map(td => {
            const tile = new HexTile(td.id, td.playerId, td.edges);
            tile.orientation = td.orientation;
            return tile;
        });


        if (opponentType === 'random') {
            const tileToPlayInstance = playerHand[Math.floor(Math.random() * playerHand.length)];
            const tileToPlayData = playerHandData.find(td => td.id === tileToPlayInstance.id); // Get corresponding plain data

            const rotations = Math.floor(Math.random() * 6);
            let tempOrientation = tileToPlayInstance.orientation;
            for (let i = 0; i < rotations; i++) {
                tempOrientation = (tempOrientation + 1) % 6;
            }
            tileToPlayInstance.orientation = tempOrientation; // Update instance for isPlacementValid

            const possiblePlacements = [];
            if (Object.keys(boardStateData).length === 0) {
                 if (isPlacementValid(tileToPlayInstance, 0, 0, boardStateData, true)) {
                    possiblePlacements.push({ x: 0, y: 0, tile: tileToPlayData, orientation: tileToPlayInstance.orientation });
                 }
            } else {
                for (const key in boardStateData) {
                    const existingTile = boardStateData[key];
                    const neighbors = getNeighbors(existingTile.x, existingTile.y);
                    for (const neighborInfo of neighbors) {
                        const potentialPos = { x: neighborInfo.nx, y: neighborInfo.ny };
                        if (!boardStateData[`${potentialPos.x},${potentialPos.y}`]) {
                            if (isPlacementValid(tileToPlayInstance, potentialPos.x, potentialPos.y, boardStateData, true)) {
                                possiblePlacements.push({ x: potentialPos.x, y: potentialPos.y, tile: tileToPlayData, orientation: tileToPlayInstance.orientation });
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

        } else if (opponentType === 'greedy') {
            let bestScoreDiff = -Infinity;
            let bestMovesList = [];

            for (const tileData of playerHandData) {
                const tileInstance = new HexTile(tileData.id, tileData.playerId, tileData.edges);
                const originalOrientation = tileData.orientation;

                for (let o = 0; o < 6; o++) {
                    tileInstance.orientation = o;
                    const placementSpots = [];
                    if (Object.keys(boardStateData).length === 0) {
                        placementSpots.push({ x: 0, y: 0 });
                    } else {
                        const checkedSpots = new Set();
                        for (const key in boardStateData) {
                            const existingTile = boardStateData[key];
                            const neighbors = getNeighbors(existingTile.x, existingTile.y);
                            for (const neighborInfo of neighbors) {
                                const spotKey = `${neighborInfo.nx},${neighborInfo.ny}`;
                                if (!boardStateData[spotKey] && !checkedSpots.has(spotKey)) {
                                    placementSpots.push({ x: neighborInfo.nx, y: neighborInfo.ny });
                                    checkedSpots.add(spotKey);
                                }
                            }
                        }
                        if (placementSpots.length === 0 && Object.keys(boardStateData).length < 5) {
                            const scanRadius = 3;
                            for (let q_scan = -scanRadius; q_scan <= scanRadius; q_scan++) {
                                for (let r_scan = -scanRadius; r_scan <= scanRadius; r_scan++) {
                                     if (Math.abs(q_scan + r_scan) > scanRadius) continue;
                                     const spotKey = `${q_scan},${r_scan}`;
                                     if(!boardStateData[spotKey] && !checkedSpots.has(spotKey)){
                                         placementSpots.push({ x: q_scan, y: r_scan });
                                         checkedSpots.add(spotKey);
                                     }
                                }
                            }
                        }
                    }

                    for (const pos of placementSpots) {
                        if (isPlacementValid(tileInstance, pos.x, pos.y, boardStateData, true)) {
                            const tempBoardState = deepCopyBoardState(boardStateData);
                            const simTileData = { ...tileData, orientation: o, x: pos.x, y: pos.y };
                            tempBoardState[`${pos.x},${pos.y}`] = simTileData;

                            const removalResult = simulateRemovalCycle(tempBoardState, aiPlayerId);
                            const boardAfterSimulatedRemovals = removalResult.boardState;

                            const scores = calculateScoresForBoard(boardAfterSimulatedRemovals);
                            const scoreDiff = scores.player2Score - scores.player1Score;

                            if (scoreDiff > bestScoreDiff) {
                                bestScoreDiff = scoreDiff;
                                bestMovesList = [{ tile: tileData, orientation: o, x: pos.x, y: pos.y, score: scoreDiff }];
                            } else if (scoreDiff === bestScoreDiff) {
                                bestMovesList.push({ tile: tileData, orientation: o, x: pos.x, y: pos.y, score: scoreDiff });
                            }
                        }
                    }
                }
                // tileInstance.orientation = originalOrientation; // Not strictly needed as we use tileData for the move
            }
            if (bestMovesList.length > 0) {
                bestMove = bestMovesList[Math.floor(Math.random() * bestMovesList.length)];
            }

        } else if (opponentType === 'greedy2') {
            const opponentPlayerId = aiPlayerId === 1 ? 2 : 1;
            // Pass plain data objects to minimax
            const minimaxResult = findBestMoveMinimax(boardStateData, playerHandData, opponentHandData, aiPlayerId, opponentPlayerId, 1); // depth 1
            if (minimaxResult && minimaxResult.moves && minimaxResult.moves.length > 0) {
                bestMove = minimaxResult.moves[Math.floor(Math.random() * minimaxResult.moves.length)];
            }
        }
        self.postMessage({ taskType: 'moveResult', move: bestMove });

    } else if (taskType === 'remove') {
        let tileToRemoveData = null; // Should be plain data: {id, x, y, playerId, edges, orientation}
        const aiPlayerId = currentPlayerId; // Should be 2

        // Reconstruct currentSurroundedTiles from data to use HexTile instances for logic
        const currentSurroundedTiles = currentSurroundedTilesData.map(td => {
            const tile = new HexTile(td.id, td.playerId, td.edges);
            tile.orientation = td.orientation;
            tile.x = td.x;
            tile.y = td.y;
            return tile;
        });

        if (opponentType === 'random') {
            const opponentTiles = currentSurroundedTiles.filter(t => t.playerId !== aiPlayerId);
            if (opponentTiles.length > 0) {
                const chosenInstance = opponentTiles[Math.floor(Math.random() * opponentTiles.length)];
                tileToRemoveData = currentSurroundedTilesData.find(td => td.id === chosenInstance.id);
            } else if (currentSurroundedTiles.length > 0) {
                const chosenInstance = currentSurroundedTiles[Math.floor(Math.random() * currentSurroundedTiles.length)];
                tileToRemoveData = currentSurroundedTilesData.find(td => td.id === chosenInstance.id);
            }
        } else if (opponentType === 'greedy' || opponentType === 'greedy2') { // Greedy2 uses same removal logic as Greedy for now
            const opponentTiles = currentSurroundedTiles.filter(t => t.playerId !== aiPlayerId);
            if (opponentTiles.length > 0) {
                // For Greedy2, could enhance this to pick the one that maximizes score after removal
                let bestChoiceInstance = opponentTiles[0]; // Default for simple greedy
                if (opponentType === 'greedy2') {
                    let maxScoreAfterRemoval = -Infinity;
                    for (const oppTileInstance of opponentTiles) {
                        const tempBoard = deepCopyBoardState(boardStateData);
                        delete tempBoard[`${oppTileInstance.x},${oppTileInstance.y}`];
                        const score = evaluateBoard(tempBoard, aiPlayerId);
                        if (score > maxScoreAfterRemoval) {
                            maxScoreAfterRemoval = score;
                            bestChoiceInstance = oppTileInstance;
                        }
                    }
                }
                tileToRemoveData = currentSurroundedTilesData.find(td => td.id === bestChoiceInstance.id);

            } else if (currentSurroundedTiles.length > 0) {
                let bestChoiceInstance = currentSurroundedTiles[0]; // Default for simple greedy
                 if (opponentType === 'greedy2') {
                    let maxScoreAfterRemoval = -Infinity; // Still maximizing our score even if removing our own
                    for (const ownTileInstance of currentSurroundedTiles) {
                         const tempBoard = deepCopyBoardState(boardStateData);
                         delete tempBoard[`${ownTileInstance.x},${ownTileInstance.y}`];
                         const score = evaluateBoard(tempBoard, aiPlayerId);
                         if (score > maxScoreAfterRemoval) {
                            maxScoreAfterRemoval = score;
                            bestChoiceInstance = ownTileInstance;
                        }
                    }
                 }
                tileToRemoveData = currentSurroundedTilesData.find(td => td.id === bestChoiceInstance.id);
            }
        }
        self.postMessage({ taskType: 'removeResult', tileToRemoveData: tileToRemoveData });
    }
};
