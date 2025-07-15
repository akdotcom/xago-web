// aiWorker.js
importScripts('gameEngine.js');

// Functions from gameEngine.js are available globally in the worker scope thanks to importScripts().
// No need to redeclare them.

function hydrateHand(handData) {
    // Note: getEmptyNeighbors, isPlacementValid, isBoardConnected, deepCopyBoardState
    // are expected to be available from gameEngine.js
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
var calculateGreedyMove = _asyncToGenerator(function* (boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, gameMode, debug, depth) {
    const effectiveDebug = (typeof debug === 'boolean' ? debug : (typeof debug !== 'undefined' ? Boolean(debug) : false));

    yield new Promise(function(resolve) { return setTimeout(resolve, 500); });

    var bestMove = null;

    self.postMessage({ task: 'aiClearEvaluationHighlight' });

    if (depth > 0) { // Minimax-based Greedy (Greedy2, Greedy4)
        if (effectiveDebug) console.log("[Worker DEBUG] AI: Greedy (depth " + depth + ", " + gameMode + ") calculating move for Player " + currentPlayerId + ".");
        else console.log("[Worker] AI: Greedy (depth " + depth + ", " + gameMode + ") calculating move for Player " + currentPlayerId + ".");

        var stats = { nodesAtHorizon: 0, cutoffs: 0 };
        var minimaxResult = findBestMoveMinimax(
            boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId,
            depth, -Infinity, Infinity, true, true, stats, depth, gameMode, effectiveDebug
        );

        if (minimaxResult && minimaxResult.moves && minimaxResult.moves.length > 0) {
            let bestInitialTurnMoves = [];
            let maxScoreAdvantage = -Infinity;

            for (const move of minimaxResult.moves) {
                const scoreAdvantage = calculateInitialTurnScore(move, boardState, currentPlayerId, opponentPlayerId);

                if (scoreAdvantage > maxScoreAdvantage) {
                    maxScoreAdvantage = scoreAdvantage;
                    bestInitialTurnMoves = [move];
                } else if (scoreAdvantage === maxScoreAdvantage) {
                    bestInitialTurnMoves.push(move);
                }
            }

            // From the moves that are best in the initial turn, pick one at random.
            const chosenMove = bestInitialTurnMoves[Math.floor(Math.random() * bestInitialTurnMoves.length)];
            bestMove = {
                type: chosenMove.type,
                tileId: chosenMove.tile.id,
                orientation: chosenMove.orientation,
                x: chosenMove.x,
                y: chosenMove.y,
                score: chosenMove.score, // This is the minimax score, not the initial turn score
                originalX: chosenMove.originalX,
                originalY: chosenMove.originalY
            };
        }
    } else { // Simple Greedy (Greedy1, depth 0)
        if (effectiveDebug) console.log("[Worker DEBUG] AI: Greedy (depth 0) calculating move for Player " + currentPlayerId + ".");
        var bestScoreDiff = -Infinity;
        var bestMoves = [];

        var possibleMoves = getAllPossibleMoves(boardState, player2Hand, currentPlayerId, gameMode, effectiveDebug);

        for (var i_pm = 0; i_pm < possibleMoves.length; i_pm++) {
            var move = possibleMoves[i_pm];

            self.postMessage({
                task: 'aiEvaluatingMove',
                moveData: {
                    tile: { id: move.tile.id, playerId: move.playerId, edges: [].concat(move.tile.edges), orientation: move.orientation },
                    x: move.x,
                    y: move.y,
                    type: move.type,
                    originalX: move.originalX,
                    originalY: move.originalY
                }
            });

            var tempBoardState = deepCopyBoardState(boardState);
            var simTile = new HexTile(move.tile.id, move.playerId, [].concat(move.tile.edges));
            simTile.orientation = move.orientation;
            simTile.x = move.x;
            simTile.y = move.y;

            if (move.type === 'place') {
                tempBoardState["" + move.x + "," + move.y] = simTile;
            } else if (move.type === 'move') {
                delete tempBoardState["" + move.originalX + "," + move.originalY];
                tempBoardState["" + move.x + "," + move.y] = simTile;
            }

            var removalResult = simulateRemovalCycle(tempBoardState, currentPlayerId, effectiveDebug);
            var boardAfterSimulatedRemovals = removalResult.boardState;

            var scores = calculateScoresForBoard(boardAfterSimulatedRemovals);
            var scoreDiff = (currentPlayerId === 2 ? scores.player2Score - scores.player1Score : scores.player1Score - scores.player2Score);

            if (scoreDiff > bestScoreDiff) {
                bestScoreDiff = scoreDiff;
                bestMoves = [{
                    type: move.type,
                    tileId: move.tile.id,
                    orientation: move.orientation,
                    x: move.x,
                    y: move.y,
                    originalX: move.originalX,
                    originalY: move.originalY,
                    score: scoreDiff
                }];
            } else if (scoreDiff === bestScoreDiff) {
                bestMoves.push({
                    type: move.type,
                    tileId: move.tile.id,
                    orientation: move.orientation,
                    x: move.x,
                    y: move.y,
                    originalX: move.originalX,
                    originalY: move.originalY,
                    score: scoreDiff
                });
            }
        }

        if (bestMoves.length > 0) {
            bestMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
        }
    }
    return bestMove;
});

var workerPerformAiMove = _asyncToGenerator(function* (boardState, player2HandOriginal, player1HandOriginal, opponentType, currentPlayerId, gameMode, debug) {
    var bestMove = null;
    var player2Hand = hydrateHand(player2HandOriginal);
    var player1Hand = hydrateHand(player1HandOriginal);
    var opponentPlayerId = (currentPlayerId % 2) + 1;

    if (opponentType === 'random') {
        yield new Promise(function(resolve) { return setTimeout(resolve, 200); });
        var possibleMoves_rand = getAllPossibleMoves(boardState, player2Hand, currentPlayerId, gameMode, debug);

        if (possibleMoves_rand.length > 0) {
            var chosenMove_rand = possibleMoves_rand[Math.floor(Math.random() * possibleMoves_rand.length)];
            bestMove = {
                type: chosenMove_rand.type,
                tileId: chosenMove_rand.tile.id,
                orientation: chosenMove_rand.orientation,
                x: chosenMove_rand.x,
                y: chosenMove_rand.y,
                originalX: chosenMove_rand.originalX,
                originalY: chosenMove_rand.originalY
            };
        } else {
            bestMove = null; // No possible moves
        }
    } else if (opponentType === 'greedy') {
        bestMove = yield calculateGreedyMove(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, gameMode, debug, 0);
    } else if (opponentType === 'greedy2') {
        bestMove = yield calculateGreedyMove(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, gameMode, debug, 1);
    } else if (opponentType === 'greedy4') {
        bestMove = yield calculateGreedyMove(boardState, player2Hand, player1Hand, currentPlayerId, opponentPlayerId, gameMode, debug, 3);
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

function calculateInitialTurnScore(move, boardState, playerId, opponentPlayerId) {
    // Simulate the move to calculate the initial turn's score.
    const tempBoardState = deepCopyBoardState(boardState);
    const simTile = new HexTile(move.tile.id, playerId, [...move.tile.edges]);
    simTile.orientation = move.orientation;
    simTile.x = move.x;
    simTile.y = move.y;

    if (move.type === 'place') {
        tempBoardState[`${move.x},${move.y}`] = simTile;
    } else if (move.type === 'move') {
        delete tempBoardState[`${move.originalX},${move.originalY}`];
        tempBoardState[`${move.x},${move.y}`] = simTile;
    }

    // After the move, simulate the removal cycle
    const removalResult = simulateRemovalCycle(tempBoardState, playerId, false); // Assuming debug is false for this simulation
    const boardAfterRemovals = removalResult.boardState;

    // Calculate scores on the board *before* the move.
    const scoresBefore = calculateScoresForBoard(boardState);
    const initialScoreDiff = (playerId === 1 ? scoresBefore.player1Score - scoresBefore.player2Score : scoresBefore.player2Score - scoresBefore.player1Score);


    // Calculate scores on the board *after* the move and removals.
    const scoresAfter = calculateScoresForBoard(boardAfterRemovals);
    const finalScoreDiff = (playerId === 1 ? scoresAfter.player1Score - scoresAfter.player2Score : scoresAfter.player2Score - scoresAfter.player1Score);

    // The advantage is the change in score difference.
    const scoreAdvantage = finalScoreDiff - initialScoreDiff;

    return scoreAdvantage;
}

// --- Minimax AI Helper Functions ---
function countTriangles(tile) {
    if (!tile || !tile.edges) return 0;
    return tile.edges.reduce((sum, edge) => sum + edge, 0);
}

function sortHand(hand) {
    return hand.sort((a, b) => {
        const trianglesA = countTriangles(a);
        const trianglesB = countTriangles(b);
        return trianglesB - trianglesA;
    });
}
// Added gameMode parameter
function getAllPossibleMoves(currentBoardState, hand, playerId, gameMode, effectiveDebug) {
    var localDebug = (typeof effectiveDebug === 'boolean') ? effectiveDebug : false;
    var possibleMoves = [];
    var initialBoardIsEmpty = Object.keys(currentBoardState).length === 0;

    var sortedHand = sortHand(hand);

    // 1. Generate moves by placing new tiles from hand
    for (const tile of sortedHand) {
        const placements = getAllPossiblePlacements(currentBoardState, tile, playerId);
        for (const placement of placements) {
            possibleMoves.push({
                type: 'place',
                tile: {id: tile.id, playerId: tile.playerId, edges: [...tile.edges]},
                orientation: placement.orientation,
                x: placement.x, y: placement.y,
                playerId: playerId
            });
        }
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
                var potentialDestinations = getEmptyNeighbors(currentBoardState, tile_to_move, maxMoveDistance);

                for (var i_pd = 0; i_pd < potentialDestinations.length; i_pd++) {
                    var dest = potentialDestinations[i_pd];
                    var q_dest = dest.x;
                    var r_dest = dest.y;

                    var dist = (Math.abs(tile_to_move.x - q_dest) + Math.abs(tile_to_move.x + tile_to_move.y - q_dest - r_dest) + Math.abs(tile_to_move.y - r_dest)) / 2;

                    if (dist > maxMoveDistance) continue;
                    if (dist === 0 && o_move === originalBoardOrientation) continue;

                    var tempTileForMoveValidation = new HexTile(tile_to_move.id, tile_to_move.playerId, [].concat(tile_to_move.edges));
                    tempTileForMoveValidation.orientation = o_move;

                    var tempBoardState = deepCopyBoardState(currentBoardState);
                    delete tempBoardState[tile_to_move.x + "," + tile_to_move.y];
                    tempTileForMoveValidation.x = q_dest;
                    tempTileForMoveValidation.y = r_dest;
                    tempBoardState[q_dest + "," + r_dest] = tempTileForMoveValidation;


                    if (isPlacementValid(tempTileForMoveValidation, q_dest, r_dest, tempBoardState, true, false) && isBoardConnected(tempBoardState)) {
                        if (localDebug) console.log("[Worker DEBUG] getAllPossibleMoves: Adding valid MOVE: Tile " + tile_to_move.id + " from (" + tile_to_move.x + "," + tile_to_move.y + ") to (" + q_dest + "," + r_dest + ") ori " + o_move);
                        possibleMoves.push({
                            type: 'move',
                            tile: {id: tile_to_move.id, playerId: tile_to_move.playerId, edges: [].concat(tile_to_move.edges)},
                            orientation: o_move,
                            x: q_dest, y: r_dest,
                            originalX: tile_to_move.x,
                            originalY: tile_to_move.y,
                            playerId: playerId
                        });
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
// Added gameMode parameter
function _simulateAndEvaluateMove(move, currentBoardState, aiHand, opponentHand, aiPlayerId, opponentPlayerId, depth, alpha, beta, maximizingPlayer, useAlphaBetaPruning, stats, initialMaxDepth, gameMode, effectiveDebug) {
    var currentPlayerForThisTurn = maximizingPlayer ? aiPlayerId : opponentPlayerId;
    var handForCurrentPlayer = maximizingPlayer ? aiHand : opponentHand;
    var nextPlayerForThisTurn = maximizingPlayer ? opponentPlayerId : aiPlayerId;

    var boardAfterMove = deepCopyBoardState(currentBoardState);
    var newHand = handForCurrentPlayer.map(function(t) { return new HexTile(t.id, t.playerId, [].concat(t.edges), t.orientation); });
    var newOpponentHand = (maximizingPlayer ? opponentHand : aiHand).map(function(t) { return new HexTile(t.id, t.playerId, [].concat(t.edges), t.orientation); });

    if (move.type === 'place') {
        var tileForSim = new HexTile(move.tile.id, currentPlayerForThisTurn, [].concat(move.tile.edges));
        tileForSim.orientation = move.orientation;
        tileForSim.x = move.x;
        tileForSim.y = move.y;
        boardAfterMove["" + move.x + "," + move.y] = tileForSim;
        newHand = newHand.filter(function(t) { return t.id !== move.tile.id; });
    } else if (move.type === 'move') {
        delete boardAfterMove["" + move.originalX + "," + move.originalY];
        var movedTileForSim = new HexTile(move.tile.id, currentPlayerForThisTurn, [].concat(move.tile.edges));
        movedTileForSim.orientation = move.orientation;
        movedTileForSim.x = move.x;
        movedTileForSim.y = move.y;
        boardAfterMove["" + move.x + "," + move.y] = movedTileForSim;
    }

    var removalResult = simulateRemovalCycle(boardAfterMove, currentPlayerForThisTurn, effectiveDebug);
    boardAfterMove = removalResult.boardState;

    var gainsCurrent = removalResult.handGains[currentPlayerForThisTurn] || [];
    for(var j=0; j<gainsCurrent.length; j++) newHand.push(new HexTile(gainsCurrent[j].id, gainsCurrent[j].playerId, gainsCurrent[j].edges));

    var gainsNext = removalResult.handGains[nextPlayerForThisTurn] || [];
    for(var k=0; k<gainsNext.length; k++) newOpponentHand.push(new HexTile(gainsNext[k].id, gainsNext[k].playerId, gainsNext[k].edges));

    if (newHand.length === 0) {
        return evaluateBoard(boardAfterMove, aiPlayerId) + (maximizingPlayer ? 1000 : -1000);
    }

    var nextMaximizingPlayer = !maximizingPlayer;
    var nextAiHand = nextMaximizingPlayer ? newOpponentHand : newHand;
    var nextOpponentHand = nextMaximizingPlayer ? newHand : newOpponentHand;

    var evalResult = findBestMoveMinimax(boardAfterMove, nextAiHand, nextOpponentHand, aiPlayerId, opponentPlayerId, depth - 1, alpha, beta, nextMaximizingPlayer, useAlphaBetaPruning, stats, initialMaxDepth, gameMode, effectiveDebug);
    return evalResult.score;
}

function findBestMoveMinimax(currentBoardState, aiHandOriginal, opponentHandOriginal, aiPlayerId, opponentPlayerId, depth, alpha, beta, maximizingPlayer, useAlphaBetaPruning, stats, initialMaxDepth, gameMode, effectiveDebug) {
    useAlphaBetaPruning = useAlphaBetaPruning === undefined ? true : useAlphaBetaPruning;
    stats = stats === undefined ? {nodesAtHorizon: 0, cutoffs: 0} : stats;
    initialMaxDepth = initialMaxDepth === undefined ? depth : initialMaxDepth;

    if (depth === 0) {
        stats.nodesAtHorizon++;
        return { score: evaluateBoard(currentBoardState, aiPlayerId), moves: [] };
    }

    var aiHand = hydrateHand(aiHandOriginal.map(function(t){ return Object.assign({}, t); }));
    var opponentHand = hydrateHand(opponentHandOriginal.map(function(t){ return Object.assign({}, t); }));

    var currentPlayerForThisTurn = maximizingPlayer ? aiPlayerId : opponentPlayerId;
    var handForCurrentPlayer = maximizingPlayer ? aiHand : opponentHand;

    var possibleMoves = getAllPossibleMoves(currentBoardState, handForCurrentPlayer, currentPlayerForThisTurn, gameMode, effectiveDebug);

    if (possibleMoves.length === 0) {
        return { score: evaluateBoard(currentBoardState, aiPlayerId), moves: [] };
    }

    var bestMoves = [];
    var bestEval = maximizingPlayer ? -Infinity : Infinity;

    for (var i = 0; i < possibleMoves.length; i++) {
        var move = possibleMoves[i];

        if (depth === initialMaxDepth && maximizingPlayer) {
            self.postMessage({
                task: 'aiEvaluatingMove',
                moveData: {
                    tile: { id: move.tile.id, playerId: move.tile.playerId, edges: [].concat(move.tile.edges), orientation: move.orientation },
                    x: move.x,
                    y: move.y,
                    type: move.type
                }
            });
        }

        var currentTurnEval = _simulateAndEvaluateMove(move, currentBoardState, aiHand, opponentHand, aiPlayerId, opponentPlayerId, depth, alpha, beta, maximizingPlayer, useAlphaBetaPruning, stats, initialMaxDepth, gameMode, effectiveDebug);

        if (maximizingPlayer) {
            if (currentTurnEval > bestEval) {
                bestEval = currentTurnEval;
                bestMoves = [{ type: move.type, tile: move.tile, orientation: move.orientation, x: move.x, y: move.y, originalX: move.originalX, originalY: move.originalY, score: bestEval }];
            } else if (currentTurnEval === bestEval) {
                bestMoves.push({ type: move.type, tile: move.tile, orientation: move.orientation, x: move.x, y: move.y, originalX: move.originalX, originalY: move.originalY, score: bestEval });
            }
            alpha = Math.max(alpha, currentTurnEval);
        } else { // Minimizing player
            if (currentTurnEval < bestEval) {
                bestEval = currentTurnEval;
            }
            beta = Math.min(beta, currentTurnEval);
        }

        if (useAlphaBetaPruning && beta <= alpha) {
            stats.cutoffs++;
            break;
        }
    }

    return maximizingPlayer ? { score: bestEval, moves: bestMoves } : { score: bestEval, moves: [] };
}

// --- Worker Message Handler ---
self.onmessage = _asyncToGenerator(function* (event) {
    invalidateWorkerOutsideCellCache(); // Invalidate cache at the start of any new task
    var data = event.data; // Avoid destructuring here for simplicity
    var task = data.task;
    var boardStateData = data.boardState;
    var player2HandData = data.player2Hand;
    var player1HandData = data.player1Hand;
    var opponentType = data.opponentType;
    var currentPlayerId = data.currentPlayerId;
    var currentSurroundedTilesData = data.currentSurroundedTiles;
    var gameModeFromData = data.gameMode || "basic"; // Get gameMode, default to "basic"
    var debugFlagFromData = data.debug || false; // Get the debug flag

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
        var bestMove = yield workerPerformAiMove(liveBoardState, player2HandData, player1HandData, opponentType, currentPlayerId, gameModeFromData, debugFlagFromData);
        self.postMessage({ task: 'aiMoveResult', move: bestMove });
    } else if (task === 'aiTileRemoval') {
        // Assuming workerPerformAiTileRemoval does not need the debug flag currently. If it did, it would be passed here too.
        var tileToRemove = workerPerformAiTileRemoval(liveBoardState, currentSurroundedTilesData, opponentType, currentPlayerId);
        self.postMessage({ task: 'aiTileRemovalResult', tileToRemove: tileToRemove });
    }
});

// console.log('[Worker] AI Worker script fully loaded and message handler set up.');
