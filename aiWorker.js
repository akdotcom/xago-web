// aiWorker.js

// --- Tile Representation ---
// Edge types: 0 for blank, 1 for triangle
// Edges are ordered clockwise starting from the top edge.
function HexTile(id, playerId, edges) {
    this.id = id; // Unique ID for the tile
    this.playerId = playerId; // 1 or 2
    this.edges = edges === undefined ? [0, 0, 0, 0, 0, 0] : edges; // Default value for edges
    this.orientation = 0; // 0-5, representing rotation
    this.x = null; // Board x position
    this.y = null; // Board y position
}

HexTile.prototype.rotate = function() {
    this.orientation = (this.orientation + 1) % 6;
};

HexTile.prototype.getOrientedEdges = function(specificOrientation) {
    var orientationToUse = (specificOrientation !== undefined && specificOrientation !== -1) ? specificOrientation : this.orientation;
    var rotatedEdges = [].concat(this.edges); // ES5 way to copy array
    for (var i = 0; i < orientationToUse; i++) {
        rotatedEdges.unshift(rotatedEdges.pop());
    }
    return rotatedEdges;
};

Object.defineProperty(HexTile.prototype, "getPlayerColor", {
    get: function() {
        return this.playerId === 1 ? 'lightblue' : 'lightcoral';
    },
    enumerable: false, // Typically false for getters converted from classes
    configurable: true
});

// Helper function to count triangles on a tile
function countTriangles(tile) {
    if (!tile || !tile.edges) return 0;
    return tile.edges.reduce(function(sum, edge) { return sum + edge; }, 0);
}

// Helper function to get unique orientations considering rotational symmetry
function getUniqueOrientations(tile) {
    var uniqueEdgePatterns = {}; // Using an object to simulate Set
    var uniqueOrientations = [];
    var tempTile = new HexTile(tile.id, tile.playerId, [].concat(tile.edges));

    for (var o = 0; o < 6; o++) {
        tempTile.orientation = o;
        var currentEdges = tempTile.getOrientedEdges().join(',');
        if (!uniqueEdgePatterns.hasOwnProperty(currentEdges)) {
            uniqueEdgePatterns[currentEdges] = true;
            uniqueOrientations.push(o);
        }
    }
    return uniqueOrientations;
}

var UNIQUE_TILE_PATTERNS_DUPLICATE_REMOVED = [ // Renamed to avoid conflict if original is elsewhere
    [0,0,0,0,0,0],
    [1,0,0,0,0,0],
    [1,1,0,0,0,0],
    [1,0,1,0,0,0],
    [1,0,0,1,0,0],
    [1,1,1,0,0,0],
    [1,1,0,1,0,0],
    [1,0,1,1,0,0],
    [1,0,1,0,1,0],
    [1,1,1,1,0,0],
    [1,1,1,0,1,0],
    [1,0,1,1,0,1],
    [1,1,1,1,1,0],
    [1,1,1,1,1,1]
];

var NUM_TILES_PER_PLAYER = 14;

// --- Game Logic Helper Functions (needed by AI) ---

function getNeighbors(q, r) {
    var axialDirections = [
        { dq: +1, dr:  0, edgeIndexOnNewTile: 0, edgeIndexOnNeighborTile: 3 },
        { dq:  0, dr: +1, edgeIndexOnNewTile: 1, edgeIndexOnNeighborTile: 4 },
        { dq: -1, dr: +1, edgeIndexOnNewTile: 2, edgeIndexOnNeighborTile: 5 },
        { dq: -1, dr:  0, edgeIndexOnNewTile: 3, edgeIndexOnNeighborTile: 0 },
        { dq:  0, dr: -1, edgeIndexOnNewTile: 4, edgeIndexOnNeighborTile: 1 },
        { dq: +1, dr: -1, edgeIndexOnNewTile: 5, edgeIndexOnNeighborTile: 2 }
    ];
    var neighbors = [];
    for (var i = 0; i < axialDirections.length; i++) {
        var dir = axialDirections[i];
        neighbors.push({
            nx: q + dir.dq,
            ny: r + dir.dr,
            edgeIndexOnNewTile: dir.edgeIndexOnNewTile,
            edgeIndexOnNeighborTile: dir.edgeIndexOnNeighborTile
        });
    }
    return neighbors;
}

function isTileSurrounded(q, r, currentBoardState) {
    var neighbors = getNeighbors(q, r);
    if (neighbors.length < 6) return false;
    for (var i = 0; i < neighbors.length; i++) {
        var neighborInfo = neighbors[i];
        if (!currentBoardState["" + neighborInfo.nx + "," + neighborInfo.ny]) {
            return false;
        }
    }
    return true;
}

function isSpaceEnclosed(q, r, currentBoardState) {
    var neighbors = getNeighbors(q, r);
    for (var i = 0; i < neighbors.length; i++) {
        var neighborInfo = neighbors[i];
        if (!currentBoardState["" + neighborInfo.nx + "," + neighborInfo.ny]) {
            return false;
        }
    }
    return true;
}

function getSurroundedTiles(currentBoardState) {
    var surroundedTiles = [];
    for (var key in currentBoardState) {
        if (currentBoardState.hasOwnProperty(key)) {
            var tile = currentBoardState[key];
            if (tile.x !== null && tile.y !== null) {
                if (isTileSurrounded(tile.x, tile.y, currentBoardState)) {
                    surroundedTiles.push(tile);
                }
            }
        }
    }
    return surroundedTiles;
}

function isPlacementValid(tile, x, y, currentBoardState, isDragOver) {
    isDragOver = isDragOver === undefined ? false : isDragOver;
    var targetKey = "" + x + "," + y;
    if (currentBoardState[targetKey]) {
        return false;
    }

    var placedTilesCount = Object.keys(currentBoardState).length;
    var orientedEdges = tile.getOrientedEdges();

    if (placedTilesCount === 0) {
        return x === 0 && y === 0;
    }

    var touchesExistingTile = false;
    var neighbors = getNeighbors(x, y);
    for (var i = 0; i < neighbors.length; i++) {
        var neighborInfo = neighbors[i];
        var neighborKey = "" + neighborInfo.nx + "," + neighborInfo.ny;
        var neighborTile = currentBoardState[neighborKey];
        if (neighborTile) {
            touchesExistingTile = true;
            var neighborOrientedEdges = neighborTile.getOrientedEdges();
            var newTileEdgeType = orientedEdges[neighborInfo.edgeIndexOnNewTile];
            var neighborEdgeType = neighborOrientedEdges[neighborInfo.edgeIndexOnNeighborTile];
            if (newTileEdgeType !== neighborEdgeType) {
                return false;
            }
        }
    }

    if (!touchesExistingTile) return false;
    if (isSpaceEnclosed(x, y, currentBoardState)) return false;
    return true;
}

function calculateScoresForBoard(currentBoardState) {
    var p1Score = 0;
    var p2Score = 0;
    for (var key in currentBoardState) {
        if (currentBoardState.hasOwnProperty(key)) {
            var tile = currentBoardState[key];
            if (!tile || typeof tile.getOrientedEdges !== 'function' || typeof tile.playerId === 'undefined') {
                continue;
            }
            var tileX = tile.x; // Avoid destructuring
            var tileY = tile.y;
            var orientedEdges = tile.getOrientedEdges();
            var neighbors = getNeighbors(tileX, tileY);
            for (var i = 0; i < neighbors.length; i++) {
                var neighborInfo = neighbors[i];
                var neighborKey = "" + neighborInfo.nx + "," + neighborInfo.ny;
                var neighborTile = currentBoardState[neighborKey];
                if (neighborTile && typeof neighborTile.getOrientedEdges === 'function' && neighborTile.playerId === tile.playerId) {
                    var edgeOnThisTile = orientedEdges[neighborInfo.edgeIndexOnNewTile];
                    var neighborOrientedEdges = neighborTile.getOrientedEdges();
                    var edgeOnNeighborTile = neighborOrientedEdges[neighborInfo.edgeIndexOnNeighborTile];
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
    var newBoardState = {};
    for (var key in originalBoardState) {
        if (originalBoardState.hasOwnProperty(key)) {
            var tileData = originalBoardState[key];
            var newTile = new HexTile(tileData.id, tileData.playerId, [].concat(tileData.edges));
            newTile.orientation = tileData.orientation;
            newTile.x = tileData.x;
            newTile.y = tileData.y;
            newBoardState[key] = newTile;
        }
    }
    return newBoardState;
}

function hydrateHand(handData) {
    return handData.map(function(tileData) {
        var tile = new HexTile(tileData.id, tileData.playerId, [].concat(tileData.edges));
        tile.orientation = tileData.orientation;
        return tile;
    });
}

// --- ES5 async/await helper ---
function _asyncToGenerator(fn) {
  return function () {
    var self = this, args = arguments;
    var gen = fn.apply(self, args);
    return new Promise(function (resolve, reject) {
      function step(key, arg) {
        try {
          var info = gen[key](arg);
          var value = info.value;
        } catch (error) {
          reject(error);
          return;
        }
        if (info.done) {
          resolve(value);
        } else {
          return Promise.resolve(value).then(function (value) {
            step("next", value);
          }, function (err) {
            step("throw", err);
          });
        }
      }
      return step("next");
    });
  };
}

// --- AI Player Logic ---

var calculateGreedyMove = _asyncToGenerator(function* (boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, isGreedy2, isGreedy3, isGreedy4) {
    isGreedy3 = isGreedy3 === undefined ? false : isGreedy3;
    isGreedy4 = isGreedy4 === undefined ? false : isGreedy4; // Added for Greedy 4
    yield new Promise(function(resolve) { return setTimeout(resolve, 500); });

    var bestMove = null;

    // Send a message to clear any previous evaluation highlight
    self.postMessage({ task: 'aiClearEvaluationHighlight' });

    if (isGreedy4) { // Check for Greedy 4 first
        console.log("[Worker] AI: Greedy 4 calculating move for Player " + currentPlayerId + ".");
        var depth = 3; // Depth 3 for 4-turn lookahead
        var statsPruned = { nodesAtHorizon: 0, cutoffs: 0 };
        var minimaxResultPruned = findBestMoveMinimax(
            boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId,
            depth, -Infinity, Infinity, true, true, statsPruned, depth // Pass initial depth
        );
        var percentageSkipped = 0;
        var totalLeavesWithoutPruning = 0;

        if (debug && statsPruned.nodesAtHorizon > 0) { // Conditional calculation
            var statsNoPruning = { nodesAtHorizon: 0, cutoffs: 0 };
            // Note: Calculating without pruning for comparison can be time-consuming, especially at higher depths.
            // Consider making this conditional or for debugging only if performance is an issue.
            findBestMoveMinimax( // For Greedy 3
                boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId,
                depth, -Infinity, Infinity, true, false, statsNoPruning, depth // Pass initial depth
            );
            totalLeavesWithoutPruning = statsNoPruning.nodesAtHorizon;
            if (totalLeavesWithoutPruning > 0) {
                var evaluatedLeavesWithPruning = statsPruned.nodesAtHorizon;
                percentageSkipped = ((totalLeavesWithoutPruning - evaluatedLeavesWithPruning) / totalLeavesWithoutPruning) * 100;
            }
        }

        if (minimaxResultPruned && minimaxResultPruned.moves && minimaxResultPruned.moves.length > 0) {
            var chosenMinimaxMove = minimaxResultPruned.moves[Math.floor(Math.random() * minimaxResultPruned.moves.length)];
            bestMove = {
                tileId: chosenMinimaxMove.tile.id,
                orientation: chosenMinimaxMove.tile.orientation,
                x: chosenMinimaxMove.x,
                y: chosenMinimaxMove.y,
                score: chosenMinimaxMove.score
            };
            console.log("[Worker] Greedy 4 AI Summary: Chose move for tile " + bestMove.tileId + " at (" + bestMove.x + "," + bestMove.y + "), orientation " + bestMove.orientation + ".");
            console.log("    Score: " + bestMove.score);
            if (debug) { // Conditional logging
                console.log("    Strict Pruning Stats: Nodes at horizon: " + statsPruned.nodesAtHorizon + ", Cutoffs: " + statsPruned.cutoffs);
                console.log("    Baseline (No Pruning): Total nodes at horizon: " + totalLeavesWithoutPruning);
                if (totalLeavesWithoutPruning > 0) {
                    console.log("    Pruning Efficiency: Skipped approx. " + percentageSkipped.toFixed(1) + "% of horizon nodes.");
                } else {
                    console.log("    Pruning Efficiency: Not applicable (no nodes at horizon without pruning).");
                }
            }
        } else {
            console.log("[Worker] Greedy 4 AI: No valid moves found.");
        }
    } else if (isGreedy3) { // Existing Greedy 3 logic
        console.log("[Worker] AI: Greedy 3 calculating move for Player " + currentPlayerId + ".");
        var depth = 2; // Depth 2 for Greedy 3
        var statsPruned = { nodesAtHorizon: 0, cutoffs: 0 };
        var minimaxResultPruned = findBestMoveMinimax(
            boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId,
            depth, -Infinity, Infinity, true, true, statsPruned, depth // Pass initial depth
        );
        var percentageSkipped = 0;
        var totalLeavesWithoutPruning = 0;

        if (debug && statsPruned.nodesAtHorizon > 0) { // Conditional calculation
            var statsNoPruning = { nodesAtHorizon: 0, cutoffs: 0 };
            findBestMoveMinimax(
                boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId,
                depth, -Infinity, Infinity, true, false, statsNoPruning, depth // Pass initial depth
            );
            totalLeavesWithoutPruning = statsNoPruning.nodesAtHorizon;
            if (totalLeavesWithoutPruning > 0) {
                var evaluatedLeavesWithPruning = statsPruned.nodesAtHorizon;
                percentageSkipped = ((totalLeavesWithoutPruning - evaluatedLeavesWithPruning) / totalLeavesWithoutPruning) * 100;
            }
        }

        if (minimaxResultPruned && minimaxResultPruned.moves && minimaxResultPruned.moves.length > 0) {
            var chosenMinimaxMove = minimaxResultPruned.moves[Math.floor(Math.random() * minimaxResultPruned.moves.length)];
            bestMove = {
                tileId: chosenMinimaxMove.tile.id,
                orientation: chosenMinimaxMove.tile.orientation,
                x: chosenMinimaxMove.x,
                y: chosenMinimaxMove.y,
                score: chosenMinimaxMove.score
            };
            console.log("[Worker] Greedy 3 AI Summary: Chose move for tile " + bestMove.tileId + " at (" + bestMove.x + "," + bestMove.y + "), orientation " + bestMove.orientation + "."); // Corrected log
            console.log("    Score: " + bestMove.score);
            if (debug) { // Conditional logging
                console.log("    Strict Pruning Stats: Nodes at horizon: " + statsPruned.nodesAtHorizon + ", Cutoffs: " + statsPruned.cutoffs);
                console.log("    Baseline (No Pruning): Total nodes at horizon: " + totalLeavesWithoutPruning);
                if (totalLeavesWithoutPruning > 0) {
                    console.log("    Pruning Efficiency: Skipped approx. " + percentageSkipped.toFixed(1) + "% of horizon nodes.");
                } else {
                    console.log("    Pruning Efficiency: Not applicable (no nodes at horizon without pruning).");
                }
            }
        } else {
            console.log("[Worker] Greedy 3 AI: No valid moves found.");
        }
    } else if (isGreedy2) {
        var minimaxResult = findBestMoveMinimax(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, 1, -Infinity, Infinity, true, true, {}, 1); // Pass initial depth 1
        if (minimaxResult && minimaxResult.moves && minimaxResult.moves.length > 0) {
            var chosenMinimaxMoveG2 = minimaxResult.moves[Math.floor(Math.random() * minimaxResult.moves.length)];
            bestMove = {
                tileId: chosenMinimaxMoveG2.tile.id,
                orientation: chosenMinimaxMoveG2.tile.orientation,
                x: chosenMinimaxMoveG2.x,
                y: chosenMinimaxMoveG2.y,
                score: chosenMinimaxMoveG2.score
            };
        }
    } else { // Greedy 1
        var bestScoreDiff = -Infinity;
        var bestMoves = [];
        var sortedHand = [].concat(player2Hand).sort(function(a, b) { return countTriangles(b) - countTriangles(a); });

        for (var i_sh = 0; i_sh < sortedHand.length; i_sh++) {
            var tile = sortedHand[i_sh];
            var originalOrientation = tile.orientation;
            var uniqueOrientations = getUniqueOrientations(tile);
            for (var i_uo = 0; i_uo < uniqueOrientations.length; i_uo++) {
                var o = uniqueOrientations[i_uo];
                tile.orientation = o;
                var placementSpots = [];
                if (Object.keys(boardState).length === 0) {
                    placementSpots.push({ x: 0, y: 0 });
                } else {
                    var checkedSpots = {}; // Use object to simulate Set
                    for (var key_bs in boardState) {
                        if (boardState.hasOwnProperty(key_bs)) {
                            var existingTile = boardState[key_bs];
                            var neighbors = getNeighbors(existingTile.x, existingTile.y);
                            for (var i_n = 0; i_n < neighbors.length; i_n++) {
                                var neighborInfo = neighbors[i_n];
                                var spotKey = "" + neighborInfo.nx + "," + neighborInfo.ny;
                                if (!boardState[spotKey] && !checkedSpots.hasOwnProperty(spotKey)) {
                                    placementSpots.push({ x: neighborInfo.nx, y: neighborInfo.ny });
                                    checkedSpots[spotKey] = true;
                                }
                            }
                        }
                    }
                    if (placementSpots.length === 0 && Object.keys(boardState).length < 5) {
                        var scanRadius = 3;
                        for (var q_scan = -scanRadius; q_scan <= scanRadius; q_scan++) {
                            for (var r_scan = -scanRadius; r_scan <= scanRadius; r_scan++) {
                                if ((Math.abs(q_scan) + Math.abs(r_scan) + Math.abs(q_scan + r_scan)) / 2 > scanRadius) continue;
                                var spotKey_sr = "" + q_scan + "," + r_scan;
                                if (!boardState[spotKey_sr] && !checkedSpots.hasOwnProperty(spotKey_sr)) {
                                    placementSpots.push({ x: q_scan, y: r_scan });
                                    checkedSpots[spotKey_sr] = true;
                                }
                            }
                        }
                    }
                }
                for (var i_ps = 0; i_ps < placementSpots.length; i_ps++) {
                    var pos = placementSpots[i_ps];

                    // For Greedy 1, send evaluation message here
                    self.postMessage({
                        task: 'aiEvaluatingMove',
                        moveData: {
                            tile: { id: tile.id, playerId: tile.playerId, edges: [].concat(tile.edges), orientation: tile.orientation },
                            x: pos.x,
                            y: pos.y
                        }
                    });

                    if (isPlacementValid(tile, pos.x, pos.y, boardState, true)) {
                        var tempBoardState = deepCopyBoardState(boardState);
                        var simTile = new HexTile(tile.id, tile.playerId, tile.edges);
                        simTile.orientation = tile.orientation;
                        simTile.x = pos.x;
                        simTile.y = pos.y;
                        tempBoardState["" + pos.x + "," + pos.y] = simTile;

                        var removalResult = simulateRemovalCycle(tempBoardState, currentPlayerId);
                        var boardAfterSimulatedRemovals = removalResult.boardState;

                        var scores = calculateScoresForBoard(boardAfterSimulatedRemovals);
                        var scoreDiff = (currentPlayerId === 2 ? scores.player2Score - scores.player1Score : scores.player1Score - scores.player2Score);

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
});

var workerPerformAiMove = _asyncToGenerator(function* (boardState, player2HandOriginal, player1HandOriginal, opponentType, currentPlayerId) {
    var bestMove = null;
    var player2Hand = hydrateHand(player2HandOriginal);
    var player1Hand = hydrateHand(player1HandOriginal);
    var opponentPlayerId = (currentPlayerId % 2) + 1;

    if (opponentType === 'random') {
        yield new Promise(function(resolve) { return setTimeout(resolve, 200); });
        if (player2Hand.length === 0) return null;
        var tileToPlay = player2Hand[Math.floor(Math.random() * player2Hand.length)];
        var originalOrientation_rand = tileToPlay.orientation;
        var rotations = Math.floor(Math.random() * 6);
        for (var i_rt = 0; i_rt < rotations; i_rt++) {
            tileToPlay.rotate();
        }

        var possiblePlacements_rand = [];
        if (Object.keys(boardState).length === 0) {
            if (isPlacementValid(tileToPlay, 0, 0, boardState, true)) {
                 possiblePlacements_rand.push({ x: 0, y: 0, tile: tileToPlay, orientation: tileToPlay.orientation });
            }
        } else {
            var checkedSpots_rand = {}; // Use object to simulate Set
            for (var key_bs_rand in boardState) {
                if (boardState.hasOwnProperty(key_bs_rand)) {
                    var existingTile_rand = boardState[key_bs_rand];
                    var neighbors_rand = getNeighbors(existingTile_rand.x, existingTile_rand.y);
                    for (var i_n_rand = 0; i_n_rand < neighbors_rand.length; i_n_rand++) {
                        var neighborInfo_rand = neighbors_rand[i_n_rand];
                        var spotKey_rand = "" + neighborInfo_rand.nx + "," + neighborInfo_rand.ny;
                        if (!boardState[spotKey_rand] && !checkedSpots_rand.hasOwnProperty(spotKey_rand)) {
                             if (isPlacementValid(tileToPlay, neighborInfo_rand.nx, neighborInfo_rand.ny, boardState, true)) {
                                possiblePlacements_rand.push({ x: neighborInfo_rand.nx, y: neighborInfo_rand.ny, tile: tileToPlay, orientation: tileToPlay.orientation });
                            }
                            checkedSpots_rand[spotKey_rand] = true;
                        }
                    }
                }
            }
             if (possiblePlacements_rand.length === 0 && Object.keys(boardState).length < 10 ) {
                var scanRadius_rand = 3;
                 for (var q_scan_rand = -scanRadius_rand; q_scan_rand <= scanRadius_rand; q_scan_rand++) {
                    for (var r_scan_rand = -scanRadius_rand; r_scan_rand <= scanRadius_rand; r_scan_rand++) {
                        if ((Math.abs(q_scan_rand) + Math.abs(r_scan_rand) + Math.abs(q_scan_rand + r_scan_rand)) / 2 > scanRadius_rand) continue;
                        var spotKey_sr_rand = "" + q_scan_rand + "," + r_scan_rand;
                        if (!boardState[spotKey_sr_rand] && !checkedSpots_rand.hasOwnProperty(spotKey_sr_rand)) {
                            if (isPlacementValid(tileToPlay, q_scan_rand, r_scan_rand, boardState, true)) {
                                possiblePlacements_rand.push({ x: q_scan_rand, y: r_scan_rand, tile: tileToPlay, orientation: tileToPlay.orientation });
                            }
                            checkedSpots_rand[spotKey_sr_rand] = true;
                        }
                    }
                }
            }
        }

        if (possiblePlacements_rand.length > 0) {
            var chosenPlacement_rand = possiblePlacements_rand[Math.floor(Math.random() * possiblePlacements_rand.length)];
            bestMove = {
                tileId: chosenPlacement_rand.tile.id,
                orientation: chosenPlacement_rand.orientation,
                x: chosenPlacement_rand.x,
                y: chosenPlacement_rand.y
            };
        }
        tileToPlay.orientation = originalOrientation_rand;

    } else if (opponentType === 'greedy') {
        bestMove = yield calculateGreedyMove(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, false, false, false);
    } else if (opponentType === 'greedy2') {
        bestMove = yield calculateGreedyMove(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, true, false, false);
    } else if (opponentType === 'greedy3') {
        bestMove = yield calculateGreedyMove(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, false, true, false);
    } else if (opponentType === 'greedy4') { // Added Greedy 4
        bestMove = yield calculateGreedyMove(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, false, false, true);
    }
    return bestMove;
});

function workerPerformAiTileRemoval(boardState, currentSurroundedTilesData, opponentType, currentPlayerId) {
    var tileToRemove = null;
    // For tile removal, Greedy 1, 2, 3, and 4 will use the same logic.
    // The main difference for these modes is in move selection (depth of search).
    // Random still behaves differently.
    if (opponentType === 'random') {
        var opponentTiles = currentSurroundedTilesData.filter(function(t) { return t.playerId !== currentPlayerId; });
        if (opponentTiles.length > 0) {
            tileToRemove = opponentTiles[Math.floor(Math.random() * opponentTiles.length)];
        } else if (currentSurroundedTilesData.length > 0) {
            tileToRemove = currentSurroundedTilesData[Math.floor(Math.random() * currentSurroundedTilesData.length)];
        }
    } else if (['greedy', 'greedy2', 'greedy3', 'greedy4'].includes(opponentType)) { // Consolidated greedy modes
        var opponentTiles_g = currentSurroundedTilesData.filter(function(t) { return t.playerId !== currentPlayerId; });
        var ownTiles_g = currentSurroundedTilesData.filter(function(t) { return t.playerId === currentPlayerId; });

        // Greedy 2, 3, and 4 use a more sophisticated removal choice.
        // Greedy 1 uses a simpler removal choice (first available).
        if (['greedy2', 'greedy3', 'greedy4'].includes(opponentType)) {
            var bestChoice = null;
            var bestScoreOverall = -Infinity;

            // Prioritize removing opponent's tiles
            if (opponentTiles_g.length > 0) {
                for (var i_otg_eval = 0; i_otg_eval < opponentTiles_g.length; i_otg_eval++) {
                    var oppTile_eval = opponentTiles_g[i_otg_eval];
                    var tempBoard_eval_opp = deepCopyBoardState(boardState);
                    delete tempBoard_eval_opp["" + oppTile_eval.x + "," + oppTile_eval.y];
                    var score_eval_opp = evaluateBoard(tempBoard_eval_opp, currentPlayerId);
                    if (score_eval_opp > bestScoreOverall) {
                        bestScoreOverall = score_eval_opp;
                        bestChoice = oppTile_eval;
                    }
                }
                tileToRemove = bestChoice; // Assign the best opponent tile to remove
            }

            // If no opponent tiles were available to remove, then consider own tiles
            if (!tileToRemove && ownTiles_g.length > 0) {
                // Reset bestChoice and bestScoreOverall for evaluating own tiles
                bestChoice = null;
                bestScoreOverall = -Infinity;
                for (var i_owg_eval = 0; i_owg_eval < ownTiles_g.length; i_owg_eval++) {
                    var ownTile_eval = ownTiles_g[i_owg_eval];
                    var tempBoard_eval_own = deepCopyBoardState(boardState);
                    delete tempBoard_eval_own["" + ownTile_eval.x + "," + ownTile_eval.y];
                    var score_eval_own = evaluateBoard(tempBoard_eval_own, currentPlayerId);
                    if (score_eval_own > bestScoreOverall) {
                        bestScoreOverall = score_eval_own;
                        bestChoice = ownTile_eval;
                    }
                }
                tileToRemove = bestChoice; // Assign the best own tile to remove
            }
        } else { // opponentType === 'greedy' (Greedy 1 - simple removal)
            if (opponentTiles_g.length > 0) tileToRemove = opponentTiles_g[0];
            else if (ownTiles_g.length > 0) tileToRemove = ownTiles_g[0];
        }
    }
    return tileToRemove ? { id: tileToRemove.id, x: tileToRemove.x, y: tileToRemove.y, playerId: tileToRemove.playerId } : null;
}

// --- Minimax AI Helper Functions ---
function getAllPossibleMoves(currentBoardState, hand, playerId) {
    var possibleMoves = [];
    var initialBoardIsEmpty = Object.keys(currentBoardState).length === 0;
    var sortedHand_moves = [].concat(hand).sort(function(a,b) { return countTriangles(b) - countTriangles(a); });

    for (var i_shm = 0; i_shm < sortedHand_moves.length; i_shm++) {
        var tile_move = sortedHand_moves[i_shm];
        var originalOrientation_move = tile_move.orientation;
        var uniqueOrientations_move = getUniqueOrientations(tile_move);
        for (var i_uom = 0; i_uom < uniqueOrientations_move.length; i_uom++) {
            var o_move = uniqueOrientations_move[i_uom];
            tile_move.orientation = o_move;
            if (initialBoardIsEmpty) {
                if (isPlacementValid(tile_move, 0, 0, currentBoardState, true)) {
                    possibleMoves.push({ tile: {id: tile_move.id, playerId: tile_move.playerId, edges: tile_move.edges}, orientation: o_move, x: 0, y: 0, playerId: playerId });
                }
            } else {
                var placementSpotsObj = {}; // Use object to simulate Set for unique spots
                for (var key_bsm in currentBoardState) {
                    if (currentBoardState.hasOwnProperty(key_bsm)) {
                        var existingTile_move = currentBoardState[key_bsm];
                        var neighbors_move = getNeighbors(existingTile_move.x, existingTile_move.y);
                        for (var i_nm = 0; i_nm < neighbors_move.length; i_nm++) {
                            var neighborInfo_move = neighbors_move[i_nm];
                            var spotKey_move = "" + neighborInfo_move.nx + "," + neighborInfo_move.ny;
                            if (!currentBoardState[spotKey_move] && !placementSpotsObj.hasOwnProperty(spotKey_move)) {
                                placementSpotsObj[spotKey_move] = { x: neighborInfo_move.nx, y: neighborInfo_move.ny };
                            }
                        }
                    }
                }
                 if (Object.keys(placementSpotsObj).length === 0 && Object.keys(currentBoardState).length < 5 && Object.keys(currentBoardState).length > 0) {
                        var scanRadius_move = 3;
                        for (var q_m = -scanRadius_move; q_m <= scanRadius_move; q_m++) {
                            for (var r_m = -scanRadius_move; r_m <= scanRadius_move; r_m++) {
                                if ((Math.abs(q_m) + Math.abs(r_m) + Math.abs(q_m + r_m)) / 2 > scanRadius_move) continue;
                                var spotKey_sr_move = "" + q_m + "," + r_m;
                                if (!currentBoardState[spotKey_sr_move] && !placementSpotsObj.hasOwnProperty(spotKey_sr_move)) {
                                     placementSpotsObj[spotKey_sr_move] = { x: q_m, y: r_m };
                                }
                            }
                        }
                    }
                for (var spotStrKey in placementSpotsObj) {
                    if (placementSpotsObj.hasOwnProperty(spotStrKey)) {
                        var spotCoords = placementSpotsObj[spotStrKey];
                        // var xy = spotStrKey.split(',').map(Number); // Avoid destructuring from map
                        // var x_coord = xy[0];
                        // var y_coord = xy[1];
                        if (isPlacementValid(tile_move, spotCoords.x, spotCoords.y, currentBoardState, true)) {
                            possibleMoves.push({ tile: {id: tile_move.id, playerId: tile_move.playerId, edges: tile_move.edges}, orientation: o_move, x: spotCoords.x, y: spotCoords.y, playerId: playerId });
                        }
                    }
                }
            }
        }
        tile_move.orientation = originalOrientation_move;
    }
    return possibleMoves;
}

function evaluateBoard(currentBoardState, playerPerspectiveId) {
    if (Object.keys(currentBoardState).length === 0 && playerPerspectiveId === 2) {
        return -1000;
    }
    if (Object.keys(currentBoardState).length === 0 && playerPerspectiveId === 1) {
        return 0;
    }
    var scores = calculateScoresForBoard(currentBoardState);
    var evalScore;
    if (playerPerspectiveId === 1) {
        evalScore = scores.player1Score - scores.player2Score;
    } else {
        evalScore = scores.player2Score - scores.player1Score;
    }
    return evalScore;
}

function simulateRemovalCycle(initialBoardState, actingPlayerId) {
    var currentSimBoardState = deepCopyBoardState(initialBoardState);
    var tilesReturnedToHands = {};
    var iteration = 0;
    while (true) {
        iteration++;
        var surroundedTiles = getSurroundedTiles(currentSimBoardState);
        if (surroundedTiles.length === 0) break;
        var tileToRemove = null;
        var opponentTilesSurrounded = surroundedTiles.filter(function(t) { return t.playerId !== actingPlayerId; });
        var ownTilesSurrounded = surroundedTiles.filter(function(t) { return t.playerId === actingPlayerId; });

        if (opponentTilesSurrounded.length > 0) {
            var bestRemovalChoice = null;
            var maxScoreAfterRemoval = -Infinity;
            for (var i_otsr = 0; i_otsr < opponentTilesSurrounded.length; i_otsr++) {
                var oppTile_sr = opponentTilesSurrounded[i_otsr];
                var tempBoard_sr = deepCopyBoardState(currentSimBoardState);
                delete tempBoard_sr["" + oppTile_sr.x + "," + oppTile_sr.y];
                var score_sr = evaluateBoard(tempBoard_sr, actingPlayerId);
                if (score_sr > maxScoreAfterRemoval) {
                    maxScoreAfterRemoval = score_sr;
                    bestRemovalChoice = oppTile_sr;
                }
            }
            tileToRemove = bestRemovalChoice;
        } else if (ownTilesSurrounded.length > 0) {
            var bestOwnRemovalChoice = null;
            var scoreAfterOwnRemoval = -Infinity;
            for (var i_owsr = 0; i_owsr < ownTilesSurrounded.length; i_owsr++) {
                var ownTile_sr = ownTilesSurrounded[i_owsr];
                var tempBoard_own_sr = deepCopyBoardState(currentSimBoardState);
                delete tempBoard_own_sr["" + ownTile_sr.x + "," + ownTile_sr.y];
                var currentScore_sr = evaluateBoard(tempBoard_own_sr, actingPlayerId);
                if (currentScore_sr > scoreAfterOwnRemoval) {
                    scoreAfterOwnRemoval = currentScore_sr;
                    bestOwnRemovalChoice = ownTile_sr;
                }
            }
            tileToRemove = bestOwnRemovalChoice;
        }

        if (tileToRemove) {
            delete currentSimBoardState["" + tileToRemove.x + "," + tileToRemove.y];
            if (!tilesReturnedToHands[tileToRemove.playerId]) {
                tilesReturnedToHands[tileToRemove.playerId] = [];
            }
            tilesReturnedToHands[tileToRemove.playerId].push({
                id: tileToRemove.id,
                playerId: tileToRemove.playerId,
                edges: [].concat(tileToRemove.edges)
            });
        } else {
            break;
        }
        if (iteration > 10) break;
    }
    return { boardState: currentSimBoardState, handGains: tilesReturnedToHands };
}

// Added initialMaxDepth to track the starting depth for sending evaluation messages
function findBestMoveMinimax(currentBoardState, aiHandOriginal, opponentHandOriginal, aiPlayerId, opponentPlayerId, depth, alpha, beta, maximizingPlayer, useAlphaBetaPruning, stats, initialMaxDepth) {
    useAlphaBetaPruning = useAlphaBetaPruning === undefined ? true : useAlphaBetaPruning;
    stats = stats === undefined ? {nodesAtHorizon: 0, cutoffs: 0} : stats;
    initialMaxDepth = initialMaxDepth === undefined ? depth : initialMaxDepth; // Initialize if not provided

    if (depth === 0) {
        stats.nodesAtHorizon++;
        return { score: evaluateBoard(currentBoardState, aiPlayerId), moves: [] };
    }

    var bestMoves = [];
    // Ensure Object.assign is used for shallow copying tile data before hydrating, if needed for map.
    var currentMaximizingPlayerHand = maximizingPlayer ? hydrateHand(aiHandOriginal.map(function(t){ return Object.assign({}, t); })) : hydrateHand(opponentHandOriginal.map(function(t){ return Object.assign({}, t); }));
    var currentMinimizingPlayerHand = maximizingPlayer ? hydrateHand(opponentHandOriginal.map(function(t){ return Object.assign({}, t); })) : hydrateHand(aiHandOriginal.map(function(t){ return Object.assign({}, t); }));

    var currentPlayerForThisTurn = maximizingPlayer ? aiPlayerId : opponentPlayerId;
    var nextPlayerForThisTurn = maximizingPlayer ? opponentPlayerId : aiPlayerId;

    var possibleMoves = getAllPossibleMoves(currentBoardState, currentMaximizingPlayerHand, currentPlayerForThisTurn);

    if (possibleMoves.length === 0) {
        return { score: evaluateBoard(currentBoardState, aiPlayerId), moves: [] };
    }

    if (maximizingPlayer) {
        var maxEval = -Infinity;
        for (var i_max_m = 0; i_max_m < possibleMoves.length; i_max_m++) {
            var move = possibleMoves[i_max_m];

            // If this is the top-level call for the maximizing player (AI's actual turn), send evaluation message
            if (depth === initialMaxDepth && maximizingPlayer) {
                self.postMessage({
                    task: 'aiEvaluatingMove',
                    moveData: {
                        // Ensure we send a plain object for the tile, not a HexTile instance directly
                        tile: { id: move.tile.id, playerId: move.tile.playerId, edges: [].concat(move.tile.edges), orientation: move.orientation },
                        x: move.x,
                        y: move.y
                    }
                });
            }

            var boardAfterMove_sim = deepCopyBoardState(currentBoardState);
            var tileForSim = new HexTile(move.tile.id, currentPlayerForThisTurn, [].concat(move.tile.edges));
            tileForSim.orientation = move.orientation;
            tileForSim.x = move.x;
            tileForSim.y = move.y;
            boardAfterMove_sim["" + move.x + "," + move.y] = tileForSim;

            var handAfterMove_sim = currentMaximizingPlayerHand.filter(function(t) { return t.id !== move.tile.id; });
            var opponentHandForNext_sim = currentMinimizingPlayerHand.map(function(t) { return new HexTile(t.id, t.playerId, [].concat(t.edges)); });

            var removalResult = simulateRemovalCycle(boardAfterMove_sim, currentPlayerForThisTurn);
            boardAfterMove_sim = removalResult.boardState;

            var gainsCurrent = removalResult.handGains[currentPlayerForThisTurn] || [];
            for(var j=0; j<gainsCurrent.length; j++) handAfterMove_sim.push(new HexTile(gainsCurrent[j].id, gainsCurrent[j].playerId, gainsCurrent[j].edges));

            var gainsNext = removalResult.handGains[nextPlayerForThisTurn] || [];
            for(var k=0; k<gainsNext.length; k++) opponentHandForNext_sim.push(new HexTile(gainsNext[k].id, gainsNext[k].playerId, gainsNext[k].edges));

            var currentTurnEval;
            if (handAfterMove_sim.length === 0) {
                currentTurnEval = evaluateBoard(boardAfterMove_sim, aiPlayerId) + 1000;
            } else {
                var evalResult = findBestMoveMinimax(boardAfterMove_sim, handAfterMove_sim, opponentHandForNext_sim, aiPlayerId, opponentPlayerId, depth - 1, alpha, beta, false, useAlphaBetaPruning, stats, initialMaxDepth);
                currentTurnEval = evalResult.score;
            }

            if (currentTurnEval > maxEval) {
                maxEval = currentTurnEval;
                bestMoves = [{ tile: {id: move.tile.id, orientation: move.orientation}, x: move.x, y: move.y, score: maxEval }];
            } else if (currentTurnEval === maxEval) {
                bestMoves.push({ tile: {id: move.tile.id, orientation: move.orientation}, x: move.x, y: move.y, score: maxEval });
            }
            alpha = Math.max(alpha, currentTurnEval);
            if (useAlphaBetaPruning && alpha >= beta) { // Corrected prune condition for maximizer
                stats.cutoffs++;
                break;
            }
        }
        return { score: maxEval, moves: bestMoves };
    } else { // Minimizing player
        var minEval = Infinity;
        for (var i_min_m = 0; i_min_m < possibleMoves.length; i_min_m++) {
            var move_min = possibleMoves[i_min_m];
            var boardAfterMove_sim_min = deepCopyBoardState(currentBoardState);
            var tileForSim_min = new HexTile(move_min.tile.id, currentPlayerForThisTurn, [].concat(move_min.tile.edges));
            tileForSim_min.orientation = move_min.orientation;
            tileForSim_min.x = move_min.x;
            tileForSim_min.y = move_min.y;
            boardAfterMove_sim_min["" + move_min.x + "," + move_min.y] = tileForSim_min;

            var handAfterMove_sim_min = currentMaximizingPlayerHand.filter(function(t) { return t.id !== move_min.tile.id; });
            var nextMaximizingHand_sim = currentMinimizingPlayerHand.map(function(t) { return new HexTile(t.id, t.playerId, [].concat(t.edges)); });

            var removalResult_min = simulateRemovalCycle(boardAfterMove_sim_min, currentPlayerForThisTurn);
            boardAfterMove_sim_min = removalResult_min.boardState;

            var gainsCurrent_min = removalResult_min.handGains[currentPlayerForThisTurn] || [];
            for(var jm=0; jm<gainsCurrent_min.length; jm++) handAfterMove_sim_min.push(new HexTile(gainsCurrent_min[jm].id, gainsCurrent_min[jm].playerId, gainsCurrent_min[jm].edges));

            var gainsNext_min = removalResult_min.handGains[nextPlayerForThisTurn] || [];
            for(var km=0; km<gainsNext_min.length; km++) nextMaximizingHand_sim.push(new HexTile(gainsNext_min[km].id, gainsNext_min[km].playerId, gainsNext_min[km].edges));

            var currentTurnEval_min;
            if (handAfterMove_sim_min.length === 0) {
                currentTurnEval_min = evaluateBoard(boardAfterMove_sim_min, aiPlayerId) - 1000;
            } else {
                var evalResult_min = findBestMoveMinimax(boardAfterMove_sim_min, nextMaximizingHand_sim, handAfterMove_sim_min, aiPlayerId, opponentPlayerId, depth - 1, alpha, beta, true, useAlphaBetaPruning, stats, initialMaxDepth);
                currentTurnEval_min = evalResult_min.score;
            }

            if (currentTurnEval_min < minEval) {
                minEval = currentTurnEval_min;
            }
            beta = Math.min(beta, currentTurnEval_min);
            if (useAlphaBetaPruning && beta <= alpha) { // Corrected prune condition for minimizer
                stats.cutoffs++;
                break;
            }
        }
        return { score: minEval, moves: [] };
    }
}

// --- Worker Message Handler ---
self.onmessage = _asyncToGenerator(function* (event) {
    var data = event.data; // Avoid destructuring here for simplicity
    var task = data.task;
    var boardStateData = data.boardState;
    var player2HandData = data.player2Hand;
    var player1HandData = data.player1Hand;
    var opponentType = data.opponentType;
    var currentPlayerId = data.currentPlayerId;
    var currentSurroundedTilesData = data.currentSurroundedTiles;
    var debug = data.debug || false; // Get the debug flag

    var liveBoardState = {};
    for (var key_lbs in boardStateData) {
        if (boardStateData.hasOwnProperty(key_lbs)) {
            var tileData_lbs = boardStateData[key_lbs];
            var tile_lbs = new HexTile(tileData_lbs.id, tileData_lbs.playerId, [].concat(tileData_lbs.edges));
            tile_lbs.orientation = tileData_lbs.orientation;
            tile_lbs.x = tileData_lbs.x;
            tile_lbs.y = tileData_lbs.y;
            liveBoardState[key_lbs] = tile_lbs;
        }
    }

    if (task === 'aiMove') {
        var bestMove = yield workerPerformAiMove(liveBoardState, player2HandData, player1HandData, opponentType, currentPlayerId);
        self.postMessage({ task: 'aiMoveResult', move: bestMove });
    } else if (task === 'aiTileRemoval') {
        var tileToRemove = workerPerformAiTileRemoval(liveBoardState, currentSurroundedTilesData, opponentType, currentPlayerId);
        self.postMessage({ task: 'aiTileRemovalResult', tileToRemove: tileToRemove });
    }
});

// console.log('[Worker] AI Worker script fully loaded and message handler set up.');
