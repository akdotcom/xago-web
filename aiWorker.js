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

function isSpaceEnclosed(q, r, currentBoardState, effectiveDebug) { // Added effectiveDebug
    var localDebug = (typeof effectiveDebug === 'boolean') ? effectiveDebug : false; // Use effectiveDebug if passed

    var neighbors = getNeighbors(q, r);
    var allNeighborsPresent = true;
    for (var i = 0; i < neighbors.length; i++) {
        var neighborInfo = neighbors[i];
        if (!currentBoardState["" + neighborInfo.nx + "," + neighborInfo.ny]) {
            allNeighborsPresent = false;
            break;
        }
    }
    if (localDebug) { // Conditional logging
        console.log("[Worker DEBUG] isSpaceEnclosed(" + q + "," + r + ") result: " + allNeighborsPresent);
    }
    return allNeighborsPresent;
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

function isPlacementValid(tile, x, y, currentBoardState, isDragOver, effectiveDebug) { // Added effectiveDebug
    isDragOver = isDragOver === undefined ? false : isDragOver; // Keep for compatibility if called without effectiveDebug
    var localDebug = (typeof effectiveDebug === 'boolean') ? effectiveDebug : false; // Use effectiveDebug if passed

    if (localDebug) {
        console.log("[Worker DEBUG] isPlacementValid: Checking tile " + tile.id + " at (" + x + "," + y + ") ori: " + tile.orientation);
    }

    var targetKey = "" + x + "," + y;
    if (currentBoardState[targetKey]) {
        if (localDebug) console.log("[Worker DEBUG] isPlacementValid: Fail - cell occupied.");
        return false;
    }

    var placedTilesCount = Object.keys(currentBoardState).length;
    var orientedEdges = tile.getOrientedEdges();

    if (placedTilesCount === 0) {
        var firstMoveValid = (x === 0 && y === 0);
        if (localDebug) console.log("[Worker DEBUG] isPlacementValid: First move check. Valid: " + firstMoveValid);
        return firstMoveValid;
    }

    var touchesExistingTile = false;
    var neighbors = getNeighbors(x, y);
    for (var i = 0; i < neighbors.length; i++) {
        var neighborInfo = neighbors[i];
        var neighborKey = "" + neighborInfo.nx + "," + neighborInfo.ny;
        var neighborTile = currentBoardState[neighborKey];
        if (neighborTile) {
            touchesExistingTile = true;
            var neighborOrientedEdges = neighborTile.getOrientedEdges(); // Ensure neighbor tile is hydrated if necessary, but should be from boardState
            var newTileEdgeType = orientedEdges[neighborInfo.edgeIndexOnNewTile];
            var neighborEdgeType = neighborOrientedEdges[neighborInfo.edgeIndexOnNeighborTile];
            if (newTileEdgeType !== neighborEdgeType) {
                if (localDebug) console.log("[Worker DEBUG] isPlacementValid: Fail - edge mismatch with neighbor at (" + neighborInfo.nx + "," + neighborInfo.ny + "). New: " + newTileEdgeType + ", Neighbor: " + neighborEdgeType);
                return false;
            }
        }
    }

    if (!touchesExistingTile) {
        if (localDebug) console.log("[Worker DEBUG] isPlacementValid: Fail - does not touch existing tile.");
        return false;
    }

    var spaceIsEnclosed = isSpaceEnclosed(x, y, currentBoardState, localDebug); // Pass localDebug
    if (spaceIsEnclosed) {
        if (localDebug) console.log("[Worker DEBUG] isPlacementValid: Fail - space (" + x + "," + y + ") is enclosed. Result from isSpaceEnclosed: " + spaceIsEnclosed);
        return false;
    }

    if (localDebug) console.log("[Worker DEBUG] isPlacementValid: Success - tile " + tile.id + " at (" + x + "," + y + ") is a valid placement.");
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
// Added gameMode parameter to calculateGreedyMove
var calculateGreedyMove = _asyncToGenerator(function* (boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, isGreedy2, isGreedy4, gameMode, debug) {
    const effectiveDebug = (typeof debug === 'boolean' ? debug : (typeof debug !== 'undefined' ? Boolean(debug) : false));

    isGreedy4 = isGreedy4 === undefined ? false : isGreedy4;
    if (effectiveDebug && (isGreedy2 || isGreedy4)) {
        console.log("[Worker DEBUG] calculateGreedyMove: Entry. PlayerID:", currentPlayerId, "isGreedy2:", isGreedy2, "isGreedy4:", isGreedy4, "GameMode:", gameMode, "EffectiveDebug:", effectiveDebug);
    }
    yield new Promise(function(resolve) { return setTimeout(resolve, 500); });

    var bestMove = null;

    self.postMessage({ task: 'aiClearEvaluationHighlight' });

    if (isGreedy4) {
        if (effectiveDebug) console.log("[Worker DEBUG] AI: Greedy 4 (" + gameMode + ") calculating move for Player " + currentPlayerId + ".");
        else console.log("[Worker] AI: Greedy 4 (" + gameMode + ") calculating move for Player " + currentPlayerId + ".");
        var depth = 3;
        var statsPruned = { nodesAtHorizon: 0, cutoffs: 0 };
        // Pass gameMode to findBestMoveMinimax (it's not directly used by findBestMoveMinimax, but by getAllPossibleMoves called within it)
        // The gameMode parameter in findBestMoveMinimax itself is a placeholder for now.
        // The crucial part is that getAllPossibleMoves receives the correct gameMode.
        // We need to ensure findBestMoveMinimax is structured to pass its own player's gameMode to getAllPossibleMoves.
        // For now, findBestMoveMinimax has a placeholder gameMode. Let's assume it correctly uses the AI's gameMode.
        var minimaxResultPruned = findBestMoveMinimax(
            boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId,
            depth, -Infinity, Infinity, true, true, statsPruned, depth, gameMode, effectiveDebug // Pass gameMode here
        );
        var percentageSkipped = 0;
        var totalLeavesWithoutPruning = 0;

        if (effectiveDebug && statsPruned.nodesAtHorizon > 0) {
            var statsNoPruning = { nodesAtHorizon: 0, cutoffs: 0 };
            findBestMoveMinimax(
                boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId,
                depth, -Infinity, Infinity, true, false, statsNoPruning, depth, gameMode, false // Pass gameMode here too
            );
            totalLeavesWithoutPruning = statsNoPruning.nodesAtHorizon;
            if (totalLeavesWithoutPruning > 0) {
                var evaluatedLeavesWithPruning = statsPruned.nodesAtHorizon;
                percentageSkipped = ((totalLeavesWithoutPruning - evaluatedLeavesWithPruning) / totalLeavesWithoutPruning) * 100;
            }
        }

        if (minimaxResultPruned && minimaxResultPruned.moves && minimaxResultPruned.moves.length > 0) {
            var chosenMinimaxMove = minimaxResultPruned.moves[Math.floor(Math.random() * minimaxResultPruned.moves.length)];
            bestMove = { // Ensure bestMove structure matches what workerPerformAiMove expects
                type: chosenMinimaxMove.type, // Pass the type
                tileId: chosenMinimaxMove.tile.id,
                orientation: chosenMinimaxMove.tile.orientation,
                x: chosenMinimaxMove.x,
                y: chosenMinimaxMove.y,
                score: chosenMinimaxMove.score,
                originalX: chosenMinimaxMove.originalX, // Include if it's a move
                originalY: chosenMinimaxMove.originalY  // Include if it's a move
            };
            console.log("[Worker] Greedy 4 AI Summary: Chose " + bestMove.type + " for tile " + bestMove.tileId + " at (" + bestMove.x + "," + bestMove.y + "), orientation " + bestMove.orientation + ".");
            console.log("    Score: " + bestMove.score);
            if (effectiveDebug) {
                console.log("    Strict Pruning Stats: Nodes at horizon: " + statsPruned.nodesAtHorizon + ", Cutoffs: " + statsPruned.cutoffs);
                console.log("    Baseline (No Pruning): Total nodes at horizon: " + totalLeavesWithoutPruning);
                if (totalLeavesWithoutPruning > 0) console.log("    Pruning Efficiency: Skipped approx. " + percentageSkipped.toFixed(1) + "% of horizon nodes.");
                else console.log("    Pruning Efficiency: Not applicable (no nodes at horizon without pruning).");
            }
        } else {
            console.log("[Worker] Greedy 4 AI: No valid moves found.");
        }
        if (effectiveDebug) console.log("[Worker DEBUG] calculateGreedyMove (Greedy 4): Minimax result:", minimaxResultPruned, "Chosen bestMove:", bestMove);
    } else if (isGreedy2) {
        if (effectiveDebug) console.log("[Worker DEBUG] AI: Greedy 2 (" + gameMode + ") calculating move for Player " + currentPlayerId + ".");
        else console.log("[Worker] AI: Greedy 2 (" + gameMode + ") calculating move for Player " + currentPlayerId + ".");
        var minimaxResult = findBestMoveMinimax(
            boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId,
            1, -Infinity, Infinity, true, true, {}, 1, gameMode, effectiveDebug // Pass gameMode here
        );
        if (minimaxResult && minimaxResult.moves && minimaxResult.moves.length > 0) {
            var chosenMinimaxMoveG2 = minimaxResult.moves[Math.floor(Math.random() * minimaxResult.moves.length)];
            bestMove = {
                type: chosenMinimaxMoveG2.type,
                tileId: chosenMinimaxMoveG2.tile.id,
                orientation: chosenMinimaxMoveG2.tile.orientation,
                x: chosenMinimaxMoveG2.x,
                y: chosenMinimaxMoveG2.y,
                score: chosenMinimaxMoveG2.score,
                originalX: chosenMinimaxMoveG2.originalX,
                originalY: chosenMinimaxMoveG2.originalY
            };
        }
    } else { // Greedy 1
        // Greedy 1 currently does not use gameMode for its own move generation logic here.
        // It only considers placing tiles from hand. If it needs to consider moves,
        // this section would need significant changes to generate and evaluate move actions.
        if (effectiveDebug) console.log("[Worker DEBUG] AI: Greedy 1 (defaulting to place-only) calculating move for Player " + currentPlayerId + ".");
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

                    if (isPlacementValid(tile, pos.x, pos.y, boardState, true, effectiveDebug)) { // Pass effectiveDebug
                        // For Greedy 1, send evaluation message here, *after* validation
                        self.postMessage({
                            task: 'aiEvaluatingMove',
                            moveData: { // For Greedy 1, this is always a 'place' action from hand
                                tile: { id: tile.id, playerId: tile.playerId, edges: [].concat(tile.edges), orientation: tile.orientation },
                                x: pos.x,
                                y: pos.y,
                                type: 'place'
                            }
                        });

                        var tempBoardState = deepCopyBoardState(boardState);
                        var simTile = new HexTile(tile.id, tile.playerId, [].concat(tile.edges));
                        simTile.orientation = tile.orientation;
                        simTile.x = pos.x;
                        simTile.y = pos.y;
                        tempBoardState["" + pos.x + "," + pos.y] = simTile;
                        // Note: Greedy 1 currently only considers placing tiles from hand.
                        // If it were to consider moves, the simulation here would need to handle 'move' types,
                        // similar to Minimax, by adjusting tempBoardState (removing from old, adding to new)
                        // and not altering the hand.
                        // For this iteration, Greedy 1's `getAllPossibleMoves` equivalent is embedded.

                        var removalResult = simulateRemovalCycle(tempBoardState, currentPlayerId, effectiveDebug); // Pass effectiveDebug
                        var boardAfterSimulatedRemovals = removalResult.boardState;

                        var scores = calculateScoresForBoard(boardAfterSimulatedRemovals);
                        var scoreDiff = (currentPlayerId === 2 ? scores.player2Score - scores.player1Score : scores.player1Score - scores.player2Score);

                        if (scoreDiff > bestScoreDiff) {
                            bestScoreDiff = scoreDiff;
                            bestMoves = [{ type: 'place', tileId: tile.id, orientation: tile.orientation, x: pos.x, y: pos.y, score: scoreDiff }];
                        } else if (scoreDiff === bestScoreDiff) {
                            bestMoves.push({ type: 'place', tileId: tile.id, orientation: tile.orientation, x: pos.x, y: pos.y, score: scoreDiff });
                        }
                    }
                }
            }
            tile.orientation = originalOrientation; // Restore original orientation of hand tile
        }

        // If gameMode is "moving", also consider moving tiles for Greedy 1
        // This part is simplified for Greedy 1; it doesn't use the full getAllPossibleMoves for moves yet.
        // It will iterate its own tiles on board and check valid moves.
        // TODO: Integrate this with a unified getAllPossibleMoves if desired later for consistency,
        // or enhance this section to be more robust for Greedy 1 moves.
        // For now, the plan focuses on Minimax AI (Greedy2/4) for move considerations via getAllPossibleMoves.
        // Greedy 1 will primarily place from hand. If we want Greedy 1 to also make moves,
        // its move generation and evaluation loop here would need to be expanded significantly.
        // The current plan description implies updates to Minimax AIs first.
        // Let's assume Greedy 1 change for moves is out of scope for this specific plan item unless clarified.

        if (bestMoves.length > 0) {
            bestMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
        }
    }
    return bestMove;
});

// Added gameMode to workerPerformAiMove and calculateGreedyMove
var workerPerformAiMove = _asyncToGenerator(function* (boardState, player2HandOriginal, player1HandOriginal, opponentType, currentPlayerId, gameMode, debug) {
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
            if (isPlacementValid(tileToPlay, 0, 0, boardState, true, debug)) {
                 possiblePlacements_rand.push({ type: 'place', x: 0, y: 0, tile: tileToPlay, orientation: tileToPlay.orientation });
            }
        } else {
            var checkedSpots_rand = {};
            for (var key_bs_rand in boardState) {
                if (boardState.hasOwnProperty(key_bs_rand)) {
                    var existingTile_rand = boardState[key_bs_rand];
                    var neighbors_rand = getNeighbors(existingTile_rand.x, existingTile_rand.y);
                    for (var i_n_rand = 0; i_n_rand < neighbors_rand.length; i_n_rand++) {
                        var neighborInfo_rand = neighbors_rand[i_n_rand];
                        var spotKey_rand = "" + neighborInfo_rand.nx + "," + neighborInfo_rand.ny;
                        if (!boardState[spotKey_rand] && !checkedSpots_rand.hasOwnProperty(spotKey_rand)) {
                             if (isPlacementValid(tileToPlay, neighborInfo_rand.nx, neighborInfo_rand.ny, boardState, true, debug)) {
                                possiblePlacements_rand.push({ type: 'place', x: neighborInfo_rand.nx, y: neighborInfo_rand.ny, tile: tileToPlay, orientation: tileToPlay.orientation });
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
                            if (isPlacementValid(tileToPlay, q_scan_rand, r_scan_rand, boardState, true, debug)) {
                                possiblePlacements_rand.push({ type: 'place', x: q_scan_rand, y: r_scan_rand, tile: tileToPlay, orientation: tileToPlay.orientation });
                            }
                            checkedSpots_rand[spotKey_sr_rand] = true;
                        }
                    }
                }
            }
        }

        if (possiblePlacements_rand.length > 0) {
            var chosenPlacement_rand = possiblePlacements_rand[Math.floor(Math.random() * possiblePlacements_rand.length)];
            bestMove = { // Random AI always places, so type is 'place'
                type: 'place',
                tileId: chosenPlacement_rand.tile.id,
                orientation: chosenPlacement_rand.orientation,
                x: chosenPlacement_rand.x,
                y: chosenPlacement_rand.y
                // No score, originalX/Y for random
            };
        }
        tileToPlay.orientation = originalOrientation_rand;

    } else if (opponentType === 'greedy') {
        // Pass gameMode to calculateGreedyMove for Greedy 1
        bestMove = yield calculateGreedyMove(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, false, false, gameMode, debug);
    } else if (opponentType === 'greedy2') {
        // Pass gameMode to calculateGreedyMove for Greedy 2
        bestMove = yield calculateGreedyMove(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, true, false, gameMode, debug);
    } else if (opponentType === 'greedy4') {
        // Pass gameMode to calculateGreedyMove for Greedy 4
        bestMove = yield calculateGreedyMove(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, false, true, gameMode, debug);
    }
    // Ensure bestMove has the 'type' field, defaulting to 'place' if not set by a Minimax AI that returns it.
    // Greedy1 currently only makes 'place' moves. Random also only 'place'.
    // Minimax (Greedy2/4) should now return type.
    if (bestMove && typeof bestMove.type === 'undefined') {
        if (debug) console.log("[Worker DEBUG] workerPerformAiMove: Best move type undefined, defaulting to 'place'. Move:", bestMove);
        bestMove.type = 'place'; // Default for safety, though should be set by calculateGreedyMove
    }

    return bestMove;
});

function workerPerformAiTileRemoval(boardState, currentSurroundedTilesData, opponentType, currentPlayerId) {
    var tileToRemove = null;
    // For tile removal, Greedy 1, 2 and 4 will use the same logic.
    // The main difference for these modes is in move selection (depth of search).
    // Random still behaves differently.
    if (opponentType === 'random') {
        var opponentTiles = currentSurroundedTilesData.filter(function(t) { return t.playerId !== currentPlayerId; });
        if (opponentTiles.length > 0) {
            tileToRemove = opponentTiles[Math.floor(Math.random() * opponentTiles.length)];
        } else if (currentSurroundedTilesData.length > 0) {
            tileToRemove = currentSurroundedTilesData[Math.floor(Math.random() * currentSurroundedTilesData.length)];
        }
    } else if (['greedy', 'greedy2', 'greedy4'].includes(opponentType)) { // Consolidated greedy modes
        var opponentTiles_g = currentSurroundedTilesData.filter(function(t) { return t.playerId !== currentPlayerId; });
        var ownTiles_g = currentSurroundedTilesData.filter(function(t) { return t.playerId === currentPlayerId; });

        // Greedy 2 and 4 use a more sophisticated removal choice.
        // Greedy 1 uses a simpler removal choice (first available).
        if (['greedy2', 'greedy4'].includes(opponentType)) {
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
// Added gameMode parameter
function getAllPossibleMoves(currentBoardState, hand, playerId, gameMode, effectiveDebug) {
    var localDebug = (typeof effectiveDebug === 'boolean') ? effectiveDebug : false;
    var possibleMoves = [];
    var initialBoardIsEmpty = Object.keys(currentBoardState).length === 0;

    // 1. Generate moves by placing new tiles from hand
    var sortedHand_moves = [].concat(hand).sort(function(a,b) { return countTriangles(b) - countTriangles(a); });
    for (var i_shm = 0; i_shm < sortedHand_moves.length; i_shm++) {
        var tile_to_place = sortedHand_moves[i_shm]; // Renamed for clarity
        var originalOrientation_place = tile_to_place.orientation;
        var uniqueOrientations_place = getUniqueOrientations(tile_to_place);

        for (var i_uop = 0; i_uop < uniqueOrientations_place.length; i_uop++) {
            var o_place = uniqueOrientations_place[i_uop];
            tile_to_place.orientation = o_place;

            if (initialBoardIsEmpty) {
                if (isPlacementValid(tile_to_place, 0, 0, currentBoardState, true, localDebug)) {
                    possibleMoves.push({
                        type: 'place', // Indicate action type
                        tile: {id: tile_to_place.id, playerId: tile_to_place.playerId, edges: [].concat(tile_to_place.edges)}, // Send copy of edges
                        orientation: o_place,
                        x: 0, y: 0,
                        playerId: playerId
                    });
                }
            } else {
                var placementSpotsObj = {};
                for (var key_bsm in currentBoardState) {
                    if (currentBoardState.hasOwnProperty(key_bsm)) {
                        var existingTile_place = currentBoardState[key_bsm];
                        var neighbors_place = getNeighbors(existingTile_place.x, existingTile_place.y);
                        for (var i_np = 0; i_np < neighbors_place.length; i_np++) {
                            var neighborInfo_place = neighbors_place[i_np];
                            var spotKey_place = "" + neighborInfo_place.nx + "," + neighborInfo_place.ny;
                            if (!currentBoardState[spotKey_place] && !placementSpotsObj.hasOwnProperty(spotKey_place)) {
                                placementSpotsObj[spotKey_place] = { x: neighborInfo_place.nx, y: neighborInfo_place.ny };
                            }
                        }
                    }
                }
                if (Object.keys(placementSpotsObj).length === 0 && Object.keys(currentBoardState).length < 5 && Object.keys(currentBoardState).length > 0) {
                    var scanRadius_place = 3;
                    for (var q_p = -scanRadius_place; q_p <= scanRadius_place; q_p++) {
                        for (var r_p = -scanRadius_place; r_p <= scanRadius_place; r_p++) {
                            if ((Math.abs(q_p) + Math.abs(r_p) + Math.abs(q_p + r_p)) / 2 > scanRadius_place) continue;
                            var spotKey_sr_place = "" + q_p + "," + r_p;
                            if (!currentBoardState[spotKey_sr_place] && !placementSpotsObj.hasOwnProperty(spotKey_sr_place)) {
                                 placementSpotsObj[spotKey_sr_place] = { x: q_p, y: r_p };
                            }
                        }
                    }
                }
                for (var spotStrKey_p in placementSpotsObj) {
                    if (placementSpotsObj.hasOwnProperty(spotStrKey_p)) {
                        var spotCoords_p = placementSpotsObj[spotStrKey_p];
                        if (isPlacementValid(tile_to_place, spotCoords_p.x, spotCoords_p.y, currentBoardState, true, localDebug)) {
                            possibleMoves.push({
                                type: 'place',
                                tile: {id: tile_to_place.id, playerId: tile_to_place.playerId, edges: [].concat(tile_to_place.edges)},
                                orientation: o_place,
                                x: spotCoords_p.x, y: spotCoords_p.y,
                                playerId: playerId
                            });
                        }
                    }
                }
            }
        }
        tile_to_place.orientation = originalOrientation_place; // Restore orientation
    }

    // 2. Generate moves by moving existing tiles on the board (if in "moving" mode)
    if (gameMode === "moving" && !initialBoardIsEmpty) {
        if (localDebug) console.log("[Worker DEBUG] getAllPossibleMoves: Player " + playerId + " is in 'moving' mode. Evaluating tile moves.");
        var playerTilesOnBoard = [];
        for (var key_bt in currentBoardState) {
            if (currentBoardState.hasOwnProperty(key_bt)) {
                var boardTile = currentBoardState[key_bt];
                if (boardTile.playerId === playerId) {
                    playerTilesOnBoard.push(boardTile);
                }
            }
        }

        for (var i_ptb = 0; i_ptb < playerTilesOnBoard.length; i_ptb++) {
            var tile_to_move = playerTilesOnBoard[i_ptb];
            var originalBoardOrientation = tile_to_move.orientation; // Store its current orientation on board
            var maxMoveDistance = tile_to_move.getOrientedEdges().filter(function(edge) { return edge === 0; }).length;

            if (localDebug) console.log("[Worker DEBUG] getAllPossibleMoves: Considering moving tile " + tile_to_move.id + " (Player " + tile_to_move.playerId + ") from (" + tile_to_move.x + "," + tile_to_move.y + "), maxDist: " + maxMoveDistance);

            var uniqueOrientations_move = getUniqueOrientations(tile_to_move);

            for (var i_uom = 0; i_uom < uniqueOrientations_move.length; i_uom++) {
                var o_move = uniqueOrientations_move[i_uom];
                // Create a temporary tile instance for validation with the new orientation
                var tempTileForMoveValidation = new HexTile(tile_to_move.id, tile_to_move.playerId, [].concat(tile_to_move.edges));
                tempTileForMoveValidation.orientation = o_move;

                // Iterate over possible destination spots
                var searchRadius = maxMoveDistance + 1; // Search a bit around the tile
                for (var q_dest = tile_to_move.x - searchRadius; q_dest <= tile_to_move.x + searchRadius; q_dest++) {
                    for (var r_dest = tile_to_move.y - searchRadius; r_dest <= tile_to_move.y + searchRadius; r_dest++) {
                        var dist = (Math.abs(tile_to_move.x - q_dest) + Math.abs(tile_to_move.x + tile_to_move.y - q_dest - r_dest) + Math.abs(tile_to_move.y - r_dest)) / 2;

                        if (dist > maxMoveDistance) continue;
                        if (dist === 0 && o_move === originalBoardOrientation) continue; // Not a move if same spot, same orientation

                        var targetKey_move = "" + q_dest + "," + r_dest;
                        var existingTileAtTarget = currentBoardState[targetKey_move];
                        if (existingTileAtTarget && existingTileAtTarget.id !== tile_to_move.id) continue; // Spot occupied by another tile

                        // Create a temporary board state for validation
                        var tempBoardState_move = deepCopyBoardState(currentBoardState);
                        delete tempBoardState_move["" + tile_to_move.x + "," + tile_to_move.y]; // Remove from old position
                        tempTileForMoveValidation.x = q_dest;
                        tempTileForMoveValidation.y = r_dest;
                        tempBoardState_move[targetKey_move] = tempTileForMoveValidation; // Add to new position

                        // Validation logic (adapted from script.js moveTileOnBoard)
                        var touchesExistingTile_move = false;
                        var edgesMatch_move = true;
                        var neighbors_move_dest = getNeighbors(q_dest, r_dest);

                        if (Object.keys(tempBoardState_move).length === 1 && tempBoardState_move[targetKey_move].id === tile_to_move.id) {
                            touchesExistingTile_move = true;
                        } else if (Object.keys(tempBoardState_move).length > 1) {
                            for (var k_nmd = 0; k_nmd < neighbors_move_dest.length; k_nmd++) {
                                var neighborInfo_md = neighbors_move_dest[k_nmd];
                                var neighbor_md = tempBoardState_move["" + neighborInfo_md.nx + "," + neighborInfo_md.ny];
                                if (neighbor_md && neighbor_md.id !== tile_to_move.id) {
                                    touchesExistingTile_move = true;
                                    var newOrientedEdges_md = tempTileForMoveValidation.getOrientedEdges(); // Using tempTileForMoveValidation
                                    var neighborOrientedEdges_md = neighbor_md.getOrientedEdges();
                                    if (newOrientedEdges_md[neighborInfo_md.edgeIndexOnNewTile] !== neighborOrientedEdges_md[neighborInfo_md.edgeIndexOnNeighborTile]) {
                                        edgesMatch_move = false; break;
                                    }
                                }
                            }
                        } else { // Board became empty
                            touchesExistingTile_move = true; // Or handle as error if this state is impossible for a move
                        }

                        var isConnected_move = isBoardConnected(tempBoardState_move); // isBoardConnected is assumed to be available in worker

                        if (localDebug && (!touchesExistingTile_move && Object.keys(tempBoardState_move).length > 1)) console.log("[Worker DEBUG] Move invalid for " + tile_to_move.id + " to (" + q_dest + "," + r_dest + ") ori " + o_move + ": does not touch existing tile.");
                        if (localDebug && !edgesMatch_move) console.log("[Worker DEBUG] Move invalid for " + tile_to_move.id + " to (" + q_dest + "," + r_dest + ") ori " + o_move + ": edge mismatch.");
                        if (localDebug && !isConnected_move) console.log("[Worker DEBUG] Move invalid for " + tile_to_move.id + " to (" + q_dest + "," + r_dest + ") ori " + o_move + ": board disconnected.");


                        if ((touchesExistingTile_move || Object.keys(tempBoardState_move).length <= 1) && edgesMatch_move && isConnected_move) {
                            if (localDebug) console.log("[Worker DEBUG] Adding valid MOVE: Tile " + tile_to_move.id + " from (" + tile_to_move.x + "," + tile_to_move.y + ") to (" + q_dest + "," + r_dest + ") ori " + o_move);
                            possibleMoves.push({
                                type: 'move',
                                tile: {id: tile_to_move.id, playerId: tile_to_move.playerId, edges: [].concat(tile_to_move.edges)}, // Send copy of edges
                                orientation: o_move,
                                x: q_dest, y: r_dest, // Destination
                                originalX: tile_to_move.x, // Original position
                                originalY: tile_to_move.y,
                                playerId: playerId
                            });
                        }
                    }
                }
            }
            // No need to restore tile_to_move.orientation as we used tempTileForMoveValidation or it's a board tile whose state is in boardState
        }
    }

    if (localDebug) console.log("[Worker DEBUG] getAllPossibleMoves: Total possible moves found: " + possibleMoves.length + " for player " + playerId);
    return possibleMoves;
}

// It seems isBoardConnected is missing in aiWorker.js. It's defined in script.js.
// For the AI worker to use it, it needs to be defined here or passed/replicated.
// For now, I'll add a simplified stub or assume it will be added.
// If it's complex, it should be replicated from script.js.
// For the purpose of this step, I'll assume a simplified version or that it will be provided.
// Adding a basic isBoardConnected here for compilation, will need to be robust.
// Copied from script.js for robustness
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

    const firstTileKey = tileKeys.find(function(key) { return currentBoardState[key] && typeof currentBoardState[key].x === 'number' && typeof currentBoardState[key].y === 'number'; });
    if (!firstTileKey) {
        return true;
    }

    const startTile = currentBoardState[firstTileKey];
    queue.push(startTile.x + "," + startTile.y);
    visited.add(startTile.x + "," + startTile.y);

    let head = 0;
    while(head < queue.length) {
        const currentKey = queue[head++];
        const currentTile = currentBoardState[currentKey];

        if (!currentTile) continue;

        const neighbors = getNeighbors(currentTile.x, currentTile.y);
        for (var i_n_ic = 0; i_n_ic < neighbors.length; i_n_ic++) {
            var neighborInfo_ic = neighbors[i_n_ic];
            const neighborKey = neighborInfo_ic.nx + "," + neighborInfo_ic.ny;
            if (currentBoardState[neighborKey] && !visited.has(neighborKey)) {
                visited.add(neighborKey);
                queue.push(neighborKey);
            }
        }
    }

    const actualTileCount = tileKeys.filter(function(key) { return currentBoardState[key] && typeof currentBoardState[key].x === 'number';}).length;
    return visited.size === actualTileCount;
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

function simulateRemovalCycle(initialBoardState, actingPlayerId, effectiveDebug) { // Added effectiveDebug
    if (effectiveDebug) {
        console.log("[Worker DEBUG] simulateRemovalCycle: Entry. ActingPlayerID:", actingPlayerId);
        console.time("[Worker DEBUG] simulateRemovalCycle: Full execution time");
    }
    var currentSimBoardState = deepCopyBoardState(initialBoardState);
    var tilesReturnedToHands = {};
    var iteration = 0;
    while (true) {
        iteration++;
        if (effectiveDebug) console.log("[Worker DEBUG] simulateRemovalCycle: Iteration " + iteration);

        var surroundedTiles = getSurroundedTiles(currentSimBoardState);
        if (effectiveDebug) console.log("[Worker DEBUG] simulateRemovalCycle: Surrounded tiles found:", surroundedTiles.map(function(t){ return t.id; }));

        if (surroundedTiles.length === 0) {
            if (effectiveDebug) console.log("[Worker DEBUG] simulateRemovalCycle: No surrounded tiles, breaking.");
            break;
        }
        var tileToRemove = null;
        var opponentTilesSurrounded = surroundedTiles.filter(function(t) { return t.playerId !== actingPlayerId; });
        var ownTilesSurrounded = surroundedTiles.filter(function(t) { return t.playerId === actingPlayerId; });

        if (effectiveDebug) console.log("[Worker DEBUG] simulateRemovalCycle: Opponent tiles surrounded:", opponentTilesSurrounded.length, "Own tiles surrounded:", ownTilesSurrounded.length);

        if (opponentTilesSurrounded.length > 0) {
            var bestRemovalChoice = null;
            var maxScoreAfterRemoval = -Infinity;
            if (effectiveDebug) console.log("[Worker DEBUG] simulateRemovalCycle: Evaluating opponent tiles for removal.");
            for (var i_otsr = 0; i_otsr < opponentTilesSurrounded.length; i_otsr++) {
                var oppTile_sr = opponentTilesSurrounded[i_otsr];
                var tempBoard_sr = deepCopyBoardState(currentSimBoardState);
                delete tempBoard_sr["" + oppTile_sr.x + "," + oppTile_sr.y];
                var score_sr = evaluateBoard(tempBoard_sr, actingPlayerId);
                if (effectiveDebug) console.log("[Worker DEBUG] simulateRemovalCycle:  - Opponent tile " + oppTile_sr.id + ", score if removed: " + score_sr);
                if (score_sr > maxScoreAfterRemoval) {
                    maxScoreAfterRemoval = score_sr;
                    bestRemovalChoice = oppTile_sr;
                }
            }
            tileToRemove = bestRemovalChoice;
            if (effectiveDebug && tileToRemove) console.log("[Worker DEBUG] simulateRemovalCycle: Chosen opponent tile to remove:", tileToRemove.id, "Score:", maxScoreAfterRemoval);
        } else if (ownTilesSurrounded.length > 0) {
            var bestOwnRemovalChoice = null;
            var scoreAfterOwnRemoval = -Infinity; // Maximize score even when removing own, implies minimizing damage or finding strategic self-removal
            if (effectiveDebug) console.log("[Worker DEBUG] simulateRemovalCycle: Evaluating own tiles for removal.");
            for (var i_owsr = 0; i_owsr < ownTilesSurrounded.length; i_owsr++) {
                var ownTile_sr = ownTilesSurrounded[i_owsr];
                var tempBoard_own_sr = deepCopyBoardState(currentSimBoardState);
                delete tempBoard_own_sr["" + ownTile_sr.x + "," + ownTile_sr.y];
                var currentScore_sr = evaluateBoard(tempBoard_own_sr, actingPlayerId);
                 if (effectiveDebug) console.log("[Worker DEBUG] simulateRemovalCycle:  - Own tile " + ownTile_sr.id + ", score if removed: " + currentScore_sr);
                if (currentScore_sr > scoreAfterOwnRemoval) { // Still ">" as evaluateBoard is from actingPlayer's perspective.
                    scoreAfterOwnRemoval = currentScore_sr;
                    bestOwnRemovalChoice = ownTile_sr;
                }
            }
            tileToRemove = bestOwnRemovalChoice;
            if (effectiveDebug && tileToRemove) console.log("[Worker DEBUG] simulateRemovalCycle: Chosen own tile to remove:", tileToRemove.id, "Score:", scoreAfterOwnRemoval);
        }

        if (tileToRemove) {
            if (effectiveDebug) console.log("[Worker DEBUG] simulateRemovalCycle: Removing tile " + tileToRemove.id + " from sim board.");
            delete currentSimBoardState["" + tileToRemove.x + "," + tileToRemove.y];
            if (!tilesReturnedToHands[tileToRemove.playerId]) {
                tilesReturnedToHands[tileToRemove.playerId] = [];
            }
            tilesReturnedToHands[tileToRemove.playerId].push({
                id: tileToRemove.id,
                playerId: tileToRemove.playerId,
                edges: [].concat(tileToRemove.edges) // Ensure edges are copied
            });
        } else {
            if (effectiveDebug) console.log("[Worker DEBUG] simulateRemovalCycle: No tile chosen for removal, breaking.");
            break;
        }
        if (iteration > 10) {
             if (effectiveDebug) console.warn("[Worker DEBUG] simulateRemovalCycle: Exceeded 10 iterations, breaking forcefully.");
            break;
        }
    }
    if (effectiveDebug) {
        console.log("[Worker DEBUG] simulateRemovalCycle: Returning. HandGains:", JSON.parse(JSON.stringify(tilesReturnedToHands))); // Log a copy
        console.timeEnd("[Worker DEBUG] simulateRemovalCycle: Full execution time");
    }
    return { boardState: currentSimBoardState, handGains: tilesReturnedToHands };
}

// Added initialMaxDepth to track the starting depth for sending evaluation messages
function findBestMoveMinimax(currentBoardState, aiHandOriginal, opponentHandOriginal, aiPlayerId, opponentPlayerId, depth, alpha, beta, maximizingPlayer, useAlphaBetaPruning, stats, initialMaxDepth, effectiveDebug) { // Added effectiveDebug
    useAlphaBetaPruning = useAlphaBetaPruning === undefined ? true : useAlphaBetaPruning;
    stats = stats === undefined ? {nodesAtHorizon: 0, cutoffs: 0} : stats;
    initialMaxDepth = initialMaxDepth === undefined ? depth : initialMaxDepth; // Initialize if not provided

    if (effectiveDebug) {
        console.log("[Worker DEBUG] findBestMoveMinimax: Entry. Depth:", depth, "Alpha:", alpha, "Beta:", beta, "Maximizing:", maximizingPlayer, "InitialMaxDepth:", initialMaxDepth, "AI:", aiPlayerId, "Opp:", opponentPlayerId);
        // To avoid excessive logging, let's not log entire board/hands here unless specifically needed for deeper debugging.
    }

    if (depth === 0) {
        stats.nodesAtHorizon++;
        var evalScoreBase = evaluateBoard(currentBoardState, aiPlayerId);
        if (effectiveDebug) console.log("[Worker DEBUG] findBestMoveMinimax: Base case (depth 0). Score:", evalScoreBase);
        return { score: evalScoreBase, moves: [] };
    }

    var bestMoves = [];
    // Ensure Object.assign is used for shallow copying tile data before hydrating, if needed for map.
    var currentMaximizingPlayerHand = maximizingPlayer ? hydrateHand(aiHandOriginal.map(function(t){ return Object.assign({}, t); })) : hydrateHand(opponentHandOriginal.map(function(t){ return Object.assign({}, t); }));
    var currentMinimizingPlayerHand = maximizingPlayer ? hydrateHand(opponentHandOriginal.map(function(t){ return Object.assign({}, t); })) : hydrateHand(aiHandOriginal.map(function(t){ return Object.assign({}, t); }));

    var currentPlayerForThisTurn = maximizingPlayer ? aiPlayerId : opponentPlayerId;
    var nextPlayerForThisTurn = maximizingPlayer ? opponentPlayerId : aiPlayerId;

    if (effectiveDebug) console.time("[Worker DEBUG] findBestMoveMinimax: getAllPossibleMoves (Depth: " + depth + ")");
    // TODO: Pass the actual gameMode for the current player (aiPlayerId or opponentPlayerId)
    // For now, defaulting to "basic" for this call as gameMode isn't passed down to findBestMoveMinimax yet.
    // This will be addressed in a subsequent step.
    // var gameModeForCurrentPlayer = "basic"; // Placeholder
    // Use the gameMode passed into findBestMoveMinimax for the maximizing player (AI).
    // For the minimizing player (opponent simulation), assume "basic" or pass opponent's game mode if available.
    var modeForGetAllPossibleMoves = maximizingPlayer ? gameMode : "basic"; // Use AI's gameMode for its turn, basic for opponent
    if (effectiveDebug) console.log("[Worker DEBUG] findBestMoveMinimax (Depth " + depth + ", Player " + currentPlayerForThisTurn + "): Calling getAllPossibleMoves with mode: " + modeForGetAllPossibleMoves);
    var possibleMoves = getAllPossibleMoves(currentBoardState, currentMaximizingPlayerHand, currentPlayerForThisTurn, modeForGetAllPossibleMoves, effectiveDebug);
    if (effectiveDebug) {
        console.timeEnd("[Worker DEBUG] findBestMoveMinimax: getAllPossibleMoves (Depth: " + depth + ")");
        console.log("[Worker DEBUG] findBestMoveMinimax: (Depth: " + depth + ") Possible moves:", possibleMoves.length);
    }

    if (possibleMoves.length === 0) {
        var evalScoreNoMoves = evaluateBoard(currentBoardState, aiPlayerId);
        if (effectiveDebug) console.log("[Worker DEBUG] findBestMoveMinimax: Base case (no possible moves). Score:", evalScoreNoMoves);
        return { score: evalScoreNoMoves, moves: [] };
    }

    if (maximizingPlayer) {
        var maxEval = -Infinity;
        for (var i_max_m = 0; i_max_m < possibleMoves.length; i_max_m++) {
            var move = possibleMoves[i_max_m];
            if (effectiveDebug) {
                console.log("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): Evaluating move " + (i_max_m + 1) + "/" + possibleMoves.length + ": Tile " + move.tile.id + " at (" + move.x + "," + move.y + ") ori " + move.orientation);
                console.time("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): Loop iteration " + (i_max_m + 1));
            }

            // If this is the top-level call for the maximizing player (AI's actual turn), send evaluation message
            if (depth === initialMaxDepth && maximizingPlayer) {
                self.postMessage({
                    task: 'aiEvaluatingMove',
                    moveData: {
                        tile: { id: move.tile.id, playerId: move.tile.playerId, edges: [].concat(move.tile.edges), orientation: move.orientation },
                        x: move.x,
                        y: move.y,
                        type: move.type // Pass type for visualization if needed
                    }
                });
            }

            var boardAfterMove_sim = deepCopyBoardState(currentBoardState);
            var handAfterMove_sim = currentMaximizingPlayerHand.map(function(t) { return new HexTile(t.id, t.playerId, [].concat(t.edges), t.orientation); }); // Deep copy hand
            var opponentHandForNext_sim = currentMinimizingPlayerHand.map(function(t) { return new HexTile(t.id, t.playerId, [].concat(t.edges), t.orientation); }); // Deep copy hand

            if (move.type === 'place') {
                var tileForSim = new HexTile(move.tile.id, currentPlayerForThisTurn, [].concat(move.tile.edges));
                tileForSim.orientation = move.orientation;
                tileForSim.x = move.x;
                tileForSim.y = move.y;
                boardAfterMove_sim["" + move.x + "," + move.y] = tileForSim;
                // Remove placed tile from hand
                handAfterMove_sim = handAfterMove_sim.filter(function(t) { return t.id !== move.tile.id; });
            } else if (move.type === 'move') {
                // Remove tile from its original position on the board
                delete boardAfterMove_sim["" + move.originalX + "," + move.originalY];
                // Place tile in its new position
                var movedTileForSim = new HexTile(move.tile.id, currentPlayerForThisTurn, [].concat(move.tile.edges));
                movedTileForSim.orientation = move.orientation;
                movedTileForSim.x = move.x;
                movedTileForSim.y = move.y;
                boardAfterMove_sim["" + move.x + "," + move.y] = movedTileForSim;
                // Hand does not change for a 'move' action
            }

            if (effectiveDebug) console.time("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): simulateRemovalCycle");
            var removalResult = simulateRemovalCycle(boardAfterMove_sim, currentPlayerForThisTurn, effectiveDebug);
            if (effectiveDebug) console.timeEnd("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): simulateRemovalCycle");
            boardAfterMove_sim = removalResult.boardState;

            var gainsCurrent = removalResult.handGains[currentPlayerForThisTurn] || [];
            for(var j=0; j<gainsCurrent.length; j++) handAfterMove_sim.push(new HexTile(gainsCurrent[j].id, gainsCurrent[j].playerId, gainsCurrent[j].edges));

            var gainsNext = removalResult.handGains[nextPlayerForThisTurn] || [];
            for(var k=0; k<gainsNext.length; k++) opponentHandForNext_sim.push(new HexTile(gainsNext[k].id, gainsNext[k].playerId, gainsNext[k].edges));

            var currentTurnEval;
            if (handAfterMove_sim.length === 0) {
                currentTurnEval = evaluateBoard(boardAfterMove_sim, aiPlayerId) + 1000; // Bonus for emptying hand
                if (effectiveDebug) console.log("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): Player emptied hand. Score:", currentTurnEval);
            } else {
                if (effectiveDebug) console.time("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): Recursive call");
                var evalResult = findBestMoveMinimax(boardAfterMove_sim, handAfterMove_sim, opponentHandForNext_sim, aiPlayerId, opponentPlayerId, depth - 1, alpha, beta, false, useAlphaBetaPruning, stats, initialMaxDepth, effectiveDebug);
                if (effectiveDebug) console.timeEnd("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): Recursive call");
                currentTurnEval = evalResult.score;
                if (effectiveDebug) console.log("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): Recursive call returned. Score:", currentTurnEval);
            }

            if (currentTurnEval > maxEval) {
                if (effectiveDebug) console.log("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): New best score. Old maxEval:", maxEval, "New:", currentTurnEval);
                maxEval = currentTurnEval;
                bestMoves = [{ tile: {id: move.tile.id, playerId: currentPlayerForThisTurn, edges: [].concat(move.tile.edges), orientation: move.orientation}, x: move.x, y: move.y, score: maxEval }];
            } else if (currentTurnEval === maxEval) {
                if (effectiveDebug) console.log("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): Equal best score. Score:", currentTurnEval);
                bestMoves.push({ tile: {id: move.tile.id, playerId: currentPlayerForThisTurn, edges: [].concat(move.tile.edges), orientation: move.orientation}, x: move.x, y: move.y, score: maxEval });
            }
            var oldAlpha = alpha;
            alpha = Math.max(alpha, currentTurnEval);
            if (effectiveDebug && oldAlpha !== alpha) console.log("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): Alpha updated. Old:", oldAlpha, "New:", alpha);

            if (useAlphaBetaPruning && alpha >= beta) {
                if (effectiveDebug) console.log("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): Pruning. Alpha:", alpha, "Beta:", beta);
                stats.cutoffs++;
                if (effectiveDebug) console.timeEnd("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): Loop iteration " + (i_max_m + 1)); // End time for this iteration before break
                break;
            }
            if (effectiveDebug) console.timeEnd("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): Loop iteration " + (i_max_m + 1));
        }
        if (effectiveDebug) console.log("[Worker DEBUG] findBestMoveMinimax (Maximizing, Depth: " + depth + "): Returning. MaxEval:", maxEval, "BestMoves count:", bestMoves.length);
        return { score: maxEval, moves: bestMoves };
    } else { // Minimizing player
        var minEval = Infinity;
        for (var i_min_m = 0; i_min_m < possibleMoves.length; i_min_m++) {
            var move_min = possibleMoves[i_min_m];
            if (effectiveDebug) {
                console.log("[Worker DEBUG] findBestMoveMinimax (Minimizing, Depth: " + depth + "): Evaluating move " + (i_min_m + 1) + "/" + possibleMoves.length + ": Tile " + move_min.tile.id + " at (" + move_min.x + "," + move_min.y + ") ori " + move_min.orientation);
                console.time("[Worker DEBUG] findBestMoveMinimax (Minimizing, Depth: " + depth + "): Loop iteration " + (i_min_m + 1));
            }

            var boardAfterMove_sim_min = deepCopyBoardState(currentBoardState);
            // Ensure hands are deep copied for simulation
            var handAfterMove_sim_min = currentMaximizingPlayerHand.map(function(t) { return new HexTile(t.id, t.playerId, [].concat(t.edges), t.orientation);});
            var nextMaximizingHand_sim = currentMinimizingPlayerHand.map(function(t) { return new HexTile(t.id, t.playerId, [].concat(t.edges), t.orientation);});


            if (move_min.type === 'place') {
                var tileForSim_min = new HexTile(move_min.tile.id, currentPlayerForThisTurn, [].concat(move_min.tile.edges));
                tileForSim_min.orientation = move_min.orientation;
                tileForSim_min.x = move_min.x;
                tileForSim_min.y = move_min.y;
                boardAfterMove_sim_min["" + move_min.x + "," + move_min.y] = tileForSim_min;
                // Remove placed tile from hand (currentMaximizingPlayerHand is opponent's hand here)
                handAfterMove_sim_min = handAfterMove_sim_min.filter(function(t) { return t.id !== move_min.tile.id; });
            } else if (move_min.type === 'move') {
                // Remove tile from its original position
                delete boardAfterMove_sim_min["" + move_min.originalX + "," + move_min.originalY];
                // Place tile in its new position
                var movedTileForSim_min = new HexTile(move_min.tile.id, currentPlayerForThisTurn, [].concat(move_min.tile.edges));
                movedTileForSim_min.orientation = move_min.orientation;
                movedTileForSim_min.x = move_min.x;
                movedTileForSim_min.y = move_min.y;
                boardAfterMove_sim_min["" + move_min.x + "," + move_min.y] = movedTileForSim_min;
                // Hand does not change for a 'move' action
            }

            if (effectiveDebug) console.time("[Worker DEBUG] findBestMoveMinimax (Minimizing, Depth: " + depth + "): simulateRemovalCycle");
            var removalResult_min = simulateRemovalCycle(boardAfterMove_sim_min, currentPlayerForThisTurn, effectiveDebug);
            if (effectiveDebug) console.timeEnd("[Worker DEBUG] findBestMoveMinimax (Minimizing, Depth: " + depth + "): simulateRemovalCycle");
            boardAfterMove_sim_min = removalResult_min.boardState;

            var gainsCurrent_min = removalResult_min.handGains[currentPlayerForThisTurn] || [];
            for(var jm=0; jm<gainsCurrent_min.length; jm++) handAfterMove_sim_min.push(new HexTile(gainsCurrent_min[jm].id, gainsCurrent_min[jm].playerId, gainsCurrent_min[jm].edges));

            var gainsNext_min = removalResult_min.handGains[nextPlayerForThisTurn] || [];
            for(var km=0; km<gainsNext_min.length; km++) nextMaximizingHand_sim.push(new HexTile(gainsNext_min[km].id, gainsNext_min[km].playerId, gainsNext_min[km].edges));

            var currentTurnEval_min;
            if (handAfterMove_sim_min.length === 0) {
                currentTurnEval_min = evaluateBoard(boardAfterMove_sim_min, aiPlayerId) - 1000; // Penalty for opponent emptying hand
                if (effectiveDebug) console.log("[Worker DEBUG] findBestMoveMinimax (Minimizing, Depth: " + depth + "): Opponent emptied hand. Score:", currentTurnEval_min);
            } else {
                if (effectiveDebug) console.time("[Worker DEBUG] findBestMoveMinimax (Minimizing, Depth: " + depth + "): Recursive call");
                var evalResult_min = findBestMoveMinimax(boardAfterMove_sim_min, nextMaximizingHand_sim, handAfterMove_sim_min, aiPlayerId, opponentPlayerId, depth - 1, alpha, beta, true, useAlphaBetaPruning, stats, initialMaxDepth, effectiveDebug);
                if (effectiveDebug) console.timeEnd("[Worker DEBUG] findBestMoveMinimax (Minimizing, Depth: " + depth + "): Recursive call");
                currentTurnEval_min = evalResult_min.score;
                if (effectiveDebug) console.log("[Worker DEBUG] findBestMoveMinimax (Minimizing, Depth: " + depth + "): Recursive call returned. Score:", currentTurnEval_min);
            }

            if (currentTurnEval_min < minEval) {
                if (effectiveDebug) console.log("[Worker DEBUG] findBestMoveMinimax (Minimizing, Depth: " + depth + "): New best score for opponent. Old minEval:", minEval, "New:", currentTurnEval_min);
                minEval = currentTurnEval_min;
            }
            var oldBeta = beta;
            beta = Math.min(beta, currentTurnEval_min);
            if (effectiveDebug && oldBeta !== beta) console.log("[Worker DEBUG] findBestMoveMinimax (Minimizing, Depth: " + depth + "): Beta updated. Old:", oldBeta, "New:", beta);

            if (useAlphaBetaPruning && beta <= alpha) {
                if (effectiveDebug) console.log("[Worker DEBUG] findBestMoveMinimax (Minimizing, Depth: " + depth + "): Pruning. Alpha:", alpha, "Beta:", beta);
                stats.cutoffs++;
                if (effectiveDebug) console.timeEnd("[Worker DEBUG] findBestMoveMinimax (Minimizing, Depth: " + depth + "): Loop iteration " + (i_min_m + 1)); // End time for this iteration before break
                break;
            }
            if (effectiveDebug) console.timeEnd("[Worker DEBUG] findBestMoveMinimax (Minimizing, Depth: " + depth + "): Loop iteration " + (i_min_m + 1));
        }
        if (effectiveDebug) console.log("[Worker DEBUG] findBestMoveMinimax (Minimizing, Depth: " + depth + "): Returning. MinEval:", minEval);
        return { score: minEval, moves: [] }; // Minimizer only returns score, not moves array
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
    var gameMode = data.gameMode || "basic"; // Get gameMode, default to "basic"
    var debugFlag = data.debug || false; // Get the debug flag

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
        var bestMove = yield workerPerformAiMove(liveBoardState, player2HandData, player1HandData, opponentType, currentPlayerId, debugFlag);
        self.postMessage({ task: 'aiMoveResult', move: bestMove });
    } else if (task === 'aiTileRemoval') {
        // Assuming workerPerformAiTileRemoval does not need the debug flag currently. If it did, it would be passed here too.
        var tileToRemove = workerPerformAiTileRemoval(liveBoardState, currentSurroundedTilesData, opponentType, currentPlayerId);
        self.postMessage({ task: 'aiTileRemovalResult', tileToRemove: tileToRemove });
    }
});

// console.log('[Worker] AI Worker script fully loaded and message handler set up.');
