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

    // Method to get a single edge considering current orientation (if rotation is implemented)
    getOrientedEdge(edgeId) {
        let i = ((edgeId - this.orientation) + 6) % 6;
        return this.edges[i];
    }

    // Basic representation for now
    get getPlayerColor() {
        return this.playerId === 1 ? 'player1-color' : 'player2-color';
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

function getUniqueOrientations(tile) {
    const uniqueEdgePatterns = new Set();
    const uniqueOrientations = [];
    const tempTile = new HexTile(tile.id, tile.playerId, [...tile.edges]);

    for (let o = 0; o < 6; o++) {
        tempTile.orientation = o;
        const currentEdges = tempTile.getOrientedEdges().join(',');
        if (!uniqueEdgePatterns.has(currentEdges)) {
            uniqueEdgePatterns.add(currentEdges);
            uniqueOrientations.push(o);
        }
    }
    return uniqueOrientations;
}

function countTriangles(tile) {
    if (!tile || !tile.edges) return 0;
    return tile.edges.reduce((sum, edge) => sum + edge, 0);
}


// --- Game Logic Helper Functions ---

// Cache for getOutsideEmptyCells in worker
const workerCacheSize = 10;
var workerCachedOutsideEmptyCells = []; // Array of {signature, result}

function invalidateWorkerOutsideCellCache() {
    workerCachedOutsideEmptyCells = [];
    // console.log("[Worker] Outside cell cache invalidated.");
}

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

function getEmptyNeighbors(currentBoardState, tile, maxDistance) {
    const emptyNeighbors = new Set(); // Use a Set to avoid duplicates
    const visited = new Set();
    const queue = [{x: tile.x, y: tile.y, dist: 0}];
    visited.add(`${tile.x},${tile.y}`);

    let head = 0;
    while (head < queue.length) {
        const {x, y, dist} = queue[head++];

        if (dist > maxDistance) continue;

        // The starting tile itself is a valid destination for a 0-distance move (rotation).
        // It is not on the board in the context of the check, so !currentBoardState[`${x},${y}`] is true.
        if (!currentBoardState[`${x},${y}`]) {
            emptyNeighbors.add(`${x},${y}`);
        }

        if (dist >= maxDistance) continue;

        const neighbors = getNeighbors(x, y);
        for (const neighborInfo of neighbors) {
            const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
            if (!visited.has(neighborKey)) {
                visited.add(neighborKey);
                // We only add neighbors to the queue. The check for empty and adding to emptyNeighbors happens
                // when we process the cell from the queue.
                queue.push({x: neighborInfo.nx, y: neighborInfo.ny, dist: dist + 1});
            }
        }
    }
    // Convert the set of keys back to an array of objects
    return Array.from(emptyNeighbors).map(key => {
        const [x, y] = key.split(',').map(Number);
        return {x, y};
    });
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

function getOutsideEmptyCells(currentBoardState) {
    const newBoardStateSignature = JSON.stringify(currentBoardState);

    // Check cache
    const cachedEntry = workerCachedOutsideEmptyCells.find(entry => entry.signature === newBoardStateSignature);
    if (cachedEntry) {
        return cachedEntry.result;
    }

    const placedTileKeys = Object.keys(currentBoardState);
    if (placedTileKeys.length === 0) {
        const singleCellSet = new Set(["0,0"]);
        // Add to cache
        workerCachedOutsideEmptyCells.unshift({ signature: newBoardStateSignature, result: singleCellSet });
        if (workerCachedOutsideEmptyCells.length > workerCacheSize) {
            workerCachedOutsideEmptyCells.pop();
        }
        return singleCellSet;
    }

    const outsideEmptyCells = new Set();
    const queue = [];

    // Find the tile furthest from the origin to start the seed search
    let furthestTile = null;
    let maxDist = -1;
    for (const key of placedTileKeys) {
        const tile = currentBoardState[key];
        const dist = Math.sqrt(tile.x * tile.x + tile.y * tile.y);
        if (dist > maxDist) {
            maxDist = dist;
            furthestTile = tile;
        }
    }

    // Among the empty neighbors of the furthest tile, find the one that is also furthest from the origin
    let seedCell = null;
    let maxSeedDist = -1;
    const neighborsOfFurthest = getNeighbors(furthestTile.x, furthestTile.y);
    for (const neighborInfo of neighborsOfFurthest) {
        const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
        if (!currentBoardState[neighborKey]) {
            const dist = Math.sqrt(neighborInfo.nx * neighborInfo.nx + neighborInfo.ny * neighborInfo.ny);
            if (dist > maxSeedDist) {
                maxSeedDist = dist;
                seedCell = { q: neighborInfo.nx, r: neighborInfo.ny };
            }
        }
    }

    if (!seedCell) {
        console.error("Catastrophic failure in getOutsideEmptyCells: No empty cells found adjacent to any tile.");
        return new Set();
    }

    const seedKey = `${seedCell.q},${seedCell.r}`;
    outsideEmptyCells.add(seedKey);
    queue.push(seedCell);

    let head = 0;
    while (head < queue.length) {
        const { q, r } = queue[head++];

        const neighbors = getNeighbors(q, r);
        for (const neighborInfo of neighbors) {
            const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
            if (currentBoardState[neighborKey] || outsideEmptyCells.has(neighborKey)) {
                continue;
            }

            // Check if the new empty neighbor is adjacent to any placed tile
            let isAdjacentToPlacedTile = false;
            const neighborsOfNeighbor = getNeighbors(neighborInfo.nx, neighborInfo.ny);
            for (const n of neighborsOfNeighbor) {
                if (currentBoardState[`${n.nx},${n.ny}`]) {
                    isAdjacentToPlacedTile = true;
                    break;
                }
            }

            if (isAdjacentToPlacedTile) {
                outsideEmptyCells.add(neighborKey);
                queue.push({ q: neighborInfo.nx, r: neighborInfo.ny });
            }
        }
    }

    // Add to cache
    workerCachedOutsideEmptyCells.unshift({ signature: newBoardStateSignature, result: outsideEmptyCells });
    if (workerCachedOutsideEmptyCells.length > workerCacheSize) {
        workerCachedOutsideEmptyCells.pop();
    }

    return outsideEmptyCells;
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

function doEdgesMatch(tile, x, y, boardState) {
    const neighbors = getNeighbors(x, y);
    let touchesExistingTile = false;

    for (const neighborInfo of neighbors) {
        const {nx, ny, edgeIndexOnNewTile, edgeIndexOnNeighborTile} = neighborInfo;
        const neighborKey = `${nx},${ny}`;
        const neighborTile = boardState[neighborKey];

        if (neighborTile) {
            touchesExistingTile = true;
            const newTileEdgeType = tile.getOrientedEdge(edgeIndexOnNewTile);
            const neighborEdgeType = neighborTile.getOrientedEdge(edgeIndexOnNeighborTile);

            if (newTileEdgeType !== neighborEdgeType) {
                return false;
            }
        }
    }
    return touchesExistingTile;
}

function isPlacementValid(tile, x, y, boardState, isDragOver = false, isNewTilePlacement = true) { // Added isNewTilePlacement
    const targetKey = `${x},${y}`;
    if (boardState[targetKey]) {
        if (!isDragOver) console.log("This cell is already occupied.");
        return false; // Cell occupied
    }

    const placedTilesCount = Object.keys(boardState).length;
    const orientedEdges = tile.getOrientedEdges();

    if (placedTilesCount === 0) {
        if (x === 0 && y === 0) {
            if (!isDragOver) console.log("First tile placed at (0,0).");
            return true;
        } else {
            if (!isDragOver) console.log("The first tile must be placed at the center (0,0).");
            return false;
        }
    }

    // Check if the placement is on an "outside" cell for NEW tiles from hand
    // This check is NOT performed for moving existing tiles on the board.
    if (isNewTilePlacement) {
        const outsideCells = getOutsideEmptyCells(boardState);
        if (!outsideCells.has(targetKey)) {
            if (!isDragOver) console.log(`Cannot place new tile at (${x},${y}). It's not an 'outside' cell.`);
            return false;
        }
    }
    // For moving tiles (isNewTilePlacement = false), they can be moved to "inside" empty spots,
    // so the above check is skipped. The isSpaceEnclosed check below is also skipped for moves.

    if (!doEdgesMatch(tile, x, y, boardState)) {
        return false;
    }

    // The original isSpaceEnclosed check should only apply to NEW tile placements.
    // Tiles being MOVED can go into an "inside" spot (which might be enclosed or not,
    // the key is that it's not restricted by the "outside" rule for hand placements).
    // The new "outside" rule for hand placements makes this specific `isSpaceEnclosed` check
    // somewhat redundant for new tiles, as `getOutsideEmptyCells` should already filter out
    // such fully enclosed single-cell "holes". However, keeping it for new tiles as a safeguard
    // against any edge cases in `getOutsideEmptyCells` is fine. It should NOT apply to moves.
    
    // Not needed since we checked that it's in an outsideEmptyEmptyCell already

    // if (isNewTilePlacement && isSpaceEnclosed(x, y, boardState)) {
    //     if (!isDragOver) console.log("Cannot place new tile in an enclosed space (isSpaceEnclosed check).");
    //     if (endLogging) endLogging('isPlacementValid');
    //     return false;
    // }

    if (!isDragOver) console.log("Valid placement.");
    return true;
}

function getAllPossiblePlacements(boardState, tile, playerId) {
    const possiblePlacements = [];
    const initialBoardIsEmpty = Object.keys(boardState).length === 0;

    const originalOrientation = tile.orientation;
    const uniqueOrientations = getUniqueOrientations(tile);

    for (const orientation of uniqueOrientations) {
        tile.orientation = orientation;

        if (initialBoardIsEmpty) {
            possiblePlacements.push({ x: 0, y: 0, orientation });
        } else {
            const outsideCells = getOutsideEmptyCells(boardState);
            for (const cellKey of outsideCells) {
                const [x, y] = cellKey.split(',').map(Number);
                if (doEdgesMatch(tile, x, y, boardState)) {
                    possiblePlacements.push({ x, y, orientation });
                }
            }
        }
    }

    tile.orientation = originalOrientation; // Restore original orientation
    return possiblePlacements;
}

function getAllPossibleOptions(currentBoardState, hand, playerId, gameMode) {
    const possibleOptions = [];

    // 1. Get all possible placements
    for (const tile of hand) {
        const placements = getAllPossiblePlacements(currentBoardState, tile, playerId);
        for (const placement of placements) {
            possibleOptions.push({
                type: 'place',
                tile: {id: tile.id, playerId: tile.playerId, edges: [...tile.edges]},
                orientation: placement.orientation,
                x: placement.x, y: placement.y,
                playerId: playerId
            });
        }
    }

    // 2. Get all possible moves
    if (gameMode === "moving") {
        const moves = getAllPossibleMoves(currentBoardState, playerId);
        possibleOptions.push(...moves);
    }

    return possibleOptions;
}

function getAllPossibleMoves(currentBoardState, playerId) {
    const possibleMoves = [];
    if (Object.keys(currentBoardState).length === 0) return possibleMoves;

    const playerTilesOnBoard = Object.values(currentBoardState).filter(t => t.playerId === playerId);

    for (const tileToMove of playerTilesOnBoard) {
        // Correctly calculate max move distance based on BLANK (0) edges of the tile's current orientation on the board
        const maxMoveDistance = tileToMove.getOrientedEdges().filter(edge => edge === 0).length;
        if (maxMoveDistance === 0) continue; // No blank edges, cannot move.

        const originalX = tileToMove.x;
        const originalY = tileToMove.y;
        const originalOrientation = tileToMove.orientation;

        // Create a temporary board state without the tile to move
        const tempBoardState = deepCopyBoardState(currentBoardState);
        delete tempBoardState[`${originalX},${originalY}`];

        // Check if the board remains connected after removing the tile
        if (!isBoardConnected(tempBoardState)) {
            continue; // This move would disconnect the board, so it's invalid.
        }

        // Find all empty cells within range
        const emptyCellsInRange = getEmptyNeighbors(currentBoardState, tileToMove, maxMoveDistance);

        // For each potential destination, check all unique orientations
        for (const cell of emptyCellsInRange) {
            const uniqueOrientations = getUniqueOrientations(tileToMove);
            for (const orientation of uniqueOrientations) {
                const tempTile = new HexTile(tileToMove.id, tileToMove.playerId, [...tileToMove.edges]);
                tempTile.orientation = orientation;

                if (doEdgesMatch(tempTile, cell.x, cell.y, tempBoardState)) {
                    possibleMoves.push({
                        type: 'move',
                        tile: { id: tileToMove.id, playerId: tileToMove.playerId, edges: [...tileToMove.edges] },
                        orientation: orientation,
                        x: cell.x,
                        y: cell.y,
                        originalX: originalX,
                        originalY: originalY,
                        playerId: playerId
                    });
                }
            }
        }
    }

    return possibleMoves;
}

function calculateScoresForBoard(currentBoardState, forTileKey = null) {
    let p1Score = 0;
    let p2Score = 0;
    let scoreDelta = 0;
    const matchedPairs = []; // For newly formed connections if forTileKey is specified

    const tilesToProcess = forTileKey ? { [forTileKey]: currentBoardState[forTileKey] } : currentBoardState;

    for (const key in tilesToProcess) {
        const tile = tilesToProcess[key];
        if (!tile || typeof tile.getOrientedEdges !== 'function' || typeof tile.playerId === 'undefined') {
            // console.warn("Skipping invalid tile in calculateScoresForBoard:", tile); // Can be noisy for delta calculation
            continue;
        }
        const { x, y } = tile;
        const orientedEdges = tile.getOrientedEdges();
        const neighbors = getNeighbors(x, y);

        for (const neighborInfo of neighbors) {
            const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
            const neighborTile = currentBoardState[neighborKey]; // Check against the full boardState

            // When calculating for a specific tile (forTileKey), we are interested in connections
            // *between* forTileKey and its neighbors.
            // If not forTileKey, we count all connections.
            if (neighborTile && typeof neighborTile.getOrientedEdges === 'function' && neighborTile.playerId === tile.playerId) {
                const edgeOnThisTile = orientedEdges[neighborInfo.edgeIndexOnNewTile];
                const neighborOrientedEdges = neighborTile.getOrientedEdges();
                const edgeOnNeighborTile = neighborOrientedEdges[neighborInfo.edgeIndexOnNeighborTile];

                if (edgeOnThisTile === 1 && edgeOnNeighborTile === 1) {
                    if (forTileKey) {
                        // Only count if one of the tiles is the forTileKey tile
                        // and the other is its direct neighbor involved in this specific check.
                        // This ensures we only count points generated by placing forTileKey.
                        if (key === forTileKey && neighborKey === `${neighborInfo.nx},${neighborInfo.ny}`) {
                            scoreDelta++; // Each matched pair for the new tile contributes 1 to its player's score delta
                            matchedPairs.push({
                                tile1: { x: tile.x, y: tile.y, edgeIndex: neighborInfo.edgeIndexOnNewTile },
                                tile2: { x: neighborTile.x, y: neighborTile.y, edgeIndex: neighborInfo.edgeIndexOnNeighborTile },
                                playerId: tile.playerId
                            });
                        }
                    } else {
                        // Calculating total score, not delta
                        if (tile.playerId === 1) {
                            p1Score++;
                        } else {
                            p2Score++;
                        }
                    }
                }
            }
        }
    }

    if (forTileKey) {
        // scoreDelta is already the raw count of new connections for the placed tile.
        // No division by 2 needed here as we are focusing on the single tile's direct new scores.
        return { scoreDelta: scoreDelta, matchedPairs: matchedPairs, scoringPlayerId: currentBoardState[forTileKey]?.playerId };
    } else {
        // For total score, divide by 2 as each connection is counted twice
        p1Score /= 2;
        p2Score /= 2;
        return { player1Score: p1Score, player2Score: p2Score };
    }
}

function calculateScoreLostFromPoppedTile(tileToPop, currentBoardState) {
    let lostScoreDelta = 0;
    const brokenPairs = []; // To store info about connections being broken

    if (!tileToPop || typeof tileToPop.getOrientedEdges !== 'function') {
        console.warn("Invalid tileToPop in calculateScoreLostFromPoppedTile");
        return { lostScoreDelta, brokenPairs };
    }

    const { x, y, playerId } = tileToPop;
    const orientedEdges = tileToPop.getOrientedEdges();
    const neighbors = getNeighbors(x, y);

    for (const neighborInfo of neighbors) {
        const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
        const neighborTile = currentBoardState[neighborKey];

        if (neighborTile && neighborTile.playerId === playerId && typeof neighborTile.getOrientedEdges === 'function') {
            const edgeOnPoppedTile = orientedEdges[neighborInfo.edgeIndexOnNewTile];
            const neighborOrientedEdges = neighborTile.getOrientedEdges();
            const edgeOnNeighborTile = neighborOrientedEdges[neighborInfo.edgeIndexOnNeighborTile];

            if (edgeOnPoppedTile === 1 && edgeOnNeighborTile === 1) {
                lostScoreDelta++;
                brokenPairs.push({
                    tile1: { x: tileToPop.x, y: tileToPop.y, edgeIndex: neighborInfo.edgeIndexOnNewTile }, // The popped tile
                    tile2: { x: neighborTile.x, y: neighborTile.y, edgeIndex: neighborInfo.edgeIndexOnNeighborTile }, // The neighbor
                    playerId: playerId
                });
            }
        }
    }
    // lostScoreDelta is the direct count of connections broken, each worth 1 point.
    return { lostScoreDelta, brokenPairs, scoringPlayerId: playerId };
}

function deepCopyBoardState(originalBoardState) {
    const newBoardState = {};
    for (const key in originalBoardState) {
        const tile = originalBoardState[key];
        // Ensure tile and its properties are valid before copying
        if (tile && typeof tile.id !== 'undefined' && typeof tile.playerId !== 'undefined' && Array.isArray(tile.edges)) {
            const newTile = new HexTile(tile.id, tile.playerId, [...tile.edges]); // Use spread for edges array
            newTile.orientation = tile.orientation || 0;
            newTile.x = (typeof tile.x === 'number') ? tile.x : null;
            newTile.y = (typeof tile.y === 'number') ? tile.y : null;
            newBoardState[key] = newTile;
        } else {
            // console.warn("Skipping invalid tile in deepCopyBoardState for key:", key, tile);
        }
    }
    return newBoardState;
}

function isBoardConnected(currentBoardState) {
    const tileKeys = Object.keys(currentBoardState);
    if (tileKeys.length === 0) {
        return true; // An empty board is connected.
    }
    if (tileKeys.length === 1 && currentBoardState[tileKeys[0]]) {
         return true; // A board with a single tile is connected.
    }


    const visited = new Set();
    const queue = [];

    // Start BFS from the first tile found.
    const firstTileKey = tileKeys.find(key => currentBoardState[key] && typeof currentBoardState[key].x === 'number' && typeof currentBoardState[key].y === 'number');
    if (!firstTileKey) {
        // This can happen if boardState contains entries that are not valid tiles (e.g. null/undefined or missing x/y)
        // Or if it's empty after filtering, which should be caught by tileKeys.length === 0.
        // console.warn("isBoardConnected: No valid starting tile found in board state:", currentBoardState);
        return true; // Or false, depending on how strictly we define "connected" for invalid states. True might be safer to not block moves unnecessarily due to bad intermediate state.
    }

    const startTile = currentBoardState[firstTileKey];
    queue.push(`${startTile.x},${startTile.y}`);
    visited.add(`${startTile.x},${startTile.y}`);

    let head = 0;
    while(head < queue.length) {
        const currentKey = queue[head++];
        const currentTile = currentBoardState[currentKey]; // Should exist if key is from queue

        if (!currentTile) continue; // Should not happen if board state is consistent

        const neighbors = getNeighbors(currentTile.x, currentTile.y);
        for (const neighborInfo of neighbors) {
            const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
            if (currentBoardState[neighborKey] && !visited.has(neighborKey)) {
                visited.add(neighborKey);
                queue.push(neighborKey);
            }
        }
    }

    // Check if all actual tiles in currentBoardState were visited.
    // tileKeys might include non-tile properties if not careful, so filter.
    const actualTileCount = tileKeys.filter(key => currentBoardState[key] && typeof currentBoardState[key].x === 'number').length;
    return visited.size === actualTileCount;
}

// Optimized function to find newly surrounded tiles after a move or placement
function getPotentiallyAffectedTilesForSurroundCheck(currentBoardState, changedTile, oldX, oldY, isMove) {
    const candidates = new Set(); // Use a Set to store tile objects to avoid duplicates

    // 1. The tile that was just placed or moved
    if (changedTile && changedTile.x !== null && changedTile.y !== null) {
        const currentTileOnBoard = currentBoardState[`${changedTile.x},${changedTile.y}`];
        if (currentTileOnBoard) candidates.add(currentTileOnBoard);
    }

    // 2. Neighbors of the new position of the changedTile
    if (changedTile && changedTile.x !== null && changedTile.y !== null) {
        getNeighbors(changedTile.x, changedTile.y).forEach(neighborInfo => {
            const neighborTile = currentBoardState[`${neighborInfo.nx},${neighborInfo.ny}`];
            if (neighborTile) candidates.add(neighborTile);
        });
    }

    // 3. If it was a move, also check neighbors of the old position
    if (isMove && oldX !== null && oldY !== null) {
        getNeighbors(oldX, oldY).forEach(neighborInfo => {
            const neighborTile = currentBoardState[`${neighborInfo.nx},${neighborInfo.ny}`];
            if (neighborTile) candidates.add(neighborTile);
        });
    }
    return Array.from(candidates);
}

function getNewlySurroundedTiles(boardToCheck, tilesToCheck) {
    const newlySurrounded = [];
    for (const tile of tilesToCheck) {
        if (tile.x !== null && tile.y !== null) { // Ensure tile is valid and on board
             // Check if it's actually in the boardToCheck, as candidates might include tiles that were just moved
            if (boardToCheck[`${tile.x},${tile.y}`] && isTileSurrounded(tile.x, tile.y, boardToCheck)) {
                newlySurrounded.push(tile);
            }
        }
    }
    return newlySurrounded;
}
