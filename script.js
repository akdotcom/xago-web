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
    const gameOverBanner = document.getElementById('game-over-banner'); // Added for game over banner

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
    let selectedTile = null; // { tile: tileObject, handElement: tileElement, isBoardTile: boolean, originalX?: int, originalY?: int }
    let gameInitialized = false;
    let isRemovingTiles = false; // Tracks if the game is in the tile removal phase
    let currentSurroundedTilesForRemoval = []; // Stores tiles that can be removed by the current player
    let opponentType = "greedy"; // Default to Greedy 1 opponent
    let player1GameMode = "basic"; // Player 1's game mode
    let player2GameMode = "basic"; // Player 2's game mode
    let player1MadeFirstMove = false; // Tracks if Player 1 has made their first move
    let player2MadeFirstMove = false; // Tracks if Player 2 has made their first move
    let mouseHoverQ = null;
    let mouseHoverR = null;
    let lastPlacedTileKey = null; // Stores the key (e.g., "x,y") of the most recently placed tile
    let aiEvaluatingDetails = null; // Stores details of the tile AI is currently evaluating

    // Pulsing animation variables for removal highlight
    let pulseStartTime = 0;
    const PULSE_DURATION = 1000; // milliseconds for one full pulse cycle
    let isPulsingGlobal = false; // To keep animateView running for pulsing
    let currentlyHighlightedTriangles = []; // For score animation highlights
    let activeScoreAnimations = []; // For "+1" animations on the board

    // State variables for toast notification logic
    let isFirstTurn = true; // This seems to track if ANY player has made the first move of the game.
    let playerHasRotatedTileThisGame = {1: false, 2: false};

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

    function animateTileReturn(tile, startX, startY, targetHandElement, callback) {
        const tempTileCanvas = document.createElement('canvas');
        // Use the tile's actual size at current zoom for the animation canvas
        const sideLength = BASE_HEX_SIDE_LENGTH * currentZoomLevel;
        // Add a small padding to ensure edges are not cut off during animation
        const canvasPadding = 10 * currentZoomLevel; // Scale padding with zoom
        tempTileCanvas.width = 2 * sideLength + canvasPadding;
        tempTileCanvas.height = Math.sqrt(3) * sideLength + canvasPadding;
        tempTileCanvas.style.position = 'absolute';
        // The startX, startY passed to this function are already the correct
        // screen coordinates of the center of the tile on the main canvas.
        // We need to adjust for the tempTileCanvas's own dimensions to position its top-left.
        tempTileCanvas.style.left = `${startX - tempTileCanvas.width / 2}px`;
        tempTileCanvas.style.top = `${startY - tempTileCanvas.height / 2}px`;
        tempTileCanvas.style.zIndex = '1001'; // Ensure it's above other elements
        document.body.appendChild(tempTileCanvas);

        const tileCtx = tempTileCanvas.getContext('2d');
        // Draw the tile on the temporary canvas, centered, using currentZoomLevel
        // The `drawHexTile` function's zoom parameter is relative to its internal BASE_HEX_SIDE_LENGTH.
        // So, to draw it at the size it appears on the board, we pass currentZoomLevel.
        drawHexTile(tileCtx, tempTileCanvas.width / 2, tempTileCanvas.height / 2, tile, currentZoomLevel);

        const targetRect = targetHandElement.getBoundingClientRect();
        // Target the center of the hand display area
        const endX = targetRect.left + targetRect.width / 2 - tempTileCanvas.width / 2 + window.scrollX;
        const endY = targetRect.top + targetRect.height / 2 - tempTileCanvas.height / 2 + window.scrollY;

        const duration = 1000; // Animation duration in ms
        let startTime = null;

        function animationStep(timestamp) {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);

            const currentX = parseFloat(tempTileCanvas.style.left) + (endX - parseFloat(tempTileCanvas.style.left)) * progress;
            const currentY = parseFloat(tempTileCanvas.style.top) + (endY - parseFloat(tempTileCanvas.style.top)) * progress;
            // const currentScale = 1 - 0.5 * progress; // Example: shrink to half size

            tempTileCanvas.style.left = `${currentX}px`;
            tempTileCanvas.style.top = `${currentY}px`;
            // tempTileCanvas.style.transform = `scale(${currentScale})`;


            if (progress < 1) {
                requestAnimationFrame(animationStep);
            } else {
                document.body.removeChild(tempTileCanvas);
                if (callback) callback();
            }
        }
        requestAnimationFrame(animationStep);
    }


    function removeTileFromBoardAndReturnToHand(tileToRemove) {
        console.log(`Initiating removal process for tile ${tileToRemove.id} by player ${tileToRemove.playerId}`);

        const tileKey = `${tileToRemove.x},${tileToRemove.y}`;
        const { lostScoreDelta, brokenPairs, scoringPlayerId } = calculateScoreLostFromPoppedTile(tileToRemove, boardState);

        let scoreContext = null;

        if (lostScoreDelta > 0 && scoringPlayerId === tileToRemove.playerId) {
            let oldPlayerScoreValue;
            if (tileToRemove.playerId === 1) {
                oldPlayerScoreValue = player1Score;
            } else {
                oldPlayerScoreValue = player2Score;
            }
            // Prepare context for score update after tile animation
            scoreContext = {
                lostScoreDelta,
                brokenPairs,
                oldPlayerScore: oldPlayerScoreValue,
                playerIdForScore: tileToRemove.playerId // Store the ID of the player whose score needs to be updated
            };
            console.log(`Player ${tileToRemove.playerId} will lose ${lostScoreDelta} points. Tile removal animation will start first.`);
            // proceedWithTileRemovalAnimation will now handle the score update sequence in its callback, using scoreContext.
            proceedWithTileRemovalAnimation(tileToRemove, tileKey, scoreContext);
        } else {
            // No score change, or tile popped does not belong to the player who loses points (e.g. opponent pops own tile - though current rules might not allow this for score loss)
            // Proceed directly with tile removal animation without score context
            console.log(`No score change for popping tile ${tileToRemove.id}, or not popped by owner. Proceeding with tile removal animation.`);
            proceedWithTileRemovalAnimation(tileToRemove, tileKey, null);
        }
    }

    // Contains the original logic of animating tile back to hand and subsequent game flow
    // Now accepts an optional scoreContext object to handle score updates after the animation.
    function proceedWithTileRemovalAnimation(tileToRemove, tileKey, scoreContext) {
        console.log(`Animating removal of tile ${tileToRemove.id} at (${tileToRemove.x}, ${tileToRemove.y}) for player ${tileToRemove.playerId}`);

        const scaledHexSideLength = BASE_HEX_SIDE_LENGTH * currentZoomLevel;
        const tileCenterXinCanvas = currentOffsetX + scaledHexSideLength * (3/2 * tileToRemove.x);
        const tileCenterYinCanvas = currentOffsetY + scaledHexSideLength * (Math.sqrt(3)/2 * tileToRemove.x + Math.sqrt(3) * tileToRemove.y);

        const canvasRect = gameCanvas.getBoundingClientRect();
        const startScreenX = tileCenterXinCanvas + canvasRect.left;
        const startScreenY = tileCenterYinCanvas + canvasRect.top;

        const targetHandElement = tileToRemove.playerId === 1 ? player1HandDisplay : player2HandDisplay;

        // It's important that the tile is logically removed from boardState *before* animateTileReturn starts,
        // so that redraws during the animation don't show it.
        // However, the original code deleted it temporarily, then redrew, then relied on it being deleted.
        // Let's make the deletion permanent here, before the animation.
        if (boardState[tileKey]) {
            delete boardState[tileKey];
            console.log(`Tile ${tileKey} permanently deleted from boardState before animation.`);
        } else {
            console.warn(`Tile ${tileKey} was already removed from boardState before proceedWithTileRemovalAnimation.`);
        }
        redrawBoardOnCanvas(); // Redraw board without the tile that will be animated

        animateTileReturn(tileToRemove, startScreenX, startScreenY, targetHandElement, () => {
            console.log(`Animation complete for tile ${tileToRemove.id}. Finalizing removal actions.`);

            if (tileToRemove.playerId === 1) {
                player1Hand.push(tileToRemove);
            } else {
                player2Hand.push(tileToRemove);
            }

            tileToRemove.x = null;
            tileToRemove.y = null;
            tileToRemove.orientation = 0;

            if (tileToRemove.playerId === 1) {
                displayPlayerHand(1, player1Hand, player1HandDisplay);
            } else {
                displayPlayerHand(2, player2Hand, player2HandDisplay);
            }

            redrawBoardOnCanvas(); // Final redraw to ensure board is clean after tile is back in hand

            // --- New sequence: Pulse and Score Update AFTER tile is back in hand ---
            if (scoreContext && scoreContext.lostScoreDelta > 0) {
                console.log("Tile back in hand. Now pulsing broken connections.");
                pulseBrokenConnections(scoreContext.brokenPairs, () => {
                    // This callback is after pulseBrokenConnections animation
                    let newPlayerScoreValue;
                    if (scoreContext.playerIdForScore === 1) {
                        player1Score -= scoreContext.lostScoreDelta;
                        newPlayerScoreValue = player1Score;
                    } else {
                        player2Score -= scoreContext.lostScoreDelta;
                        newPlayerScoreValue = player2Score;
                    }
                    console.log(`Broken connections pulse complete. Player ${scoreContext.playerIdForScore} lost ${scoreContext.lostScoreDelta} points. Old: ${scoreContext.oldPlayerScore}, New: ${newPlayerScoreValue}. Animating score.`);

                    animateScoreChangeOnBoard(scoreContext.playerIdForScore, scoreContext.brokenPairs, "-1", () => { // textToShow "-1" is ignored
                        animateScoreboardUpdate(scoreContext.playerIdForScore, newPlayerScoreValue, scoreContext.oldPlayerScore, () => {
                            // This callback is after the scoreboard visually updates.
                            console.log("Scoreboard animation complete. Proceeding with game logic (check surrounded, switch turn).");
                            // Now proceed with the rest of the game logic
                            continueGameLogicAfterTileRemoval();
                    updateURLWithGameState(); // Update URL after tile removal effects are processed
                        });
                    });
                });
            } else {
                // No score change, or no scoreContext provided, proceed directly with game logic
                console.log("Tile back in hand. No score change to process. Proceeding with game logic.");
                continueGameLogicAfterTileRemoval();
            }
        });
    }

    // Helper function to encapsulate the game logic that follows tile removal and potential score updates
    function continueGameLogicAfterTileRemoval() {
        const newSurroundedList = getSurroundedTiles(boardState);
        currentSurroundedTilesForRemoval = newSurroundedList;
        updateViewParameters();

        if (newSurroundedList.length > 0) {
            console.log("More surrounded tiles found:", newSurroundedList.map(t => t.id));
            if (currentPlayer === 2 && ['random', 'greedy', 'greedy2', 'greedy3', 'greedy4', 'greedy6', 'greedy8'].includes(opponentType)) {
                player2HandContainer.classList.add('ai-thinking-pulse');
                setTimeout(() => {
                    initiateAiTileRemoval();
                }, 1000);
            } else {
                player2HandContainer.classList.remove('ai-thinking-pulse');
                redrawBoardOnCanvas(); // Update highlights for human
            }
        } else {
            console.log("No more surrounded tiles. Ending removal phase.");
            player2HandContainer.classList.remove('ai-thinking-pulse');
            isRemovingTiles = false;
            isPulsingGlobal = false; // Ensure this is reset if no more pulsing needed
            currentSurroundedTilesForRemoval = [];
            redrawBoardOnCanvas(); // Clear highlights

            // If scores were lost, they were updated before calling this function.
            // If no scores were lost, calculateAndUpdateTotalScores() does nothing or recalculates (harmless).
            // It's good practice to call it to ensure the game state is correct before switching turns,
            // especially if other factors could influence scores (though not currently the case for simple pop).
            calculateAndUpdateTotalScores(); // This ensures scores are consistent.
            switchTurn();
        }
        updateURLWithGameState(); // Update URL after removal logic concludes or continues
        // Ensure the animation loop continues if needed for view changes or other ongoing animations.
        if (isPulsingGlobal || needsViewAnimation() || activeScoreAnimations.length > 0) {
            if (!animationFrameId) animateView();
        }
    }

    // Helper function to check if view animation (pan/zoom) is needed
    function needsViewAnimation() {
        return Math.abs(targetOffsetX - currentOffsetX) > 0.1 ||
               Math.abs(targetOffsetY - currentOffsetY) > 0.1 ||
               Math.abs(targetZoomLevel - currentZoomLevel) > 0.001;
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

            // For tiles on the board, isSelected is typically false (it's for hand tile glow).
            // transparentBackground is also false for board tiles.
            const isLastPlaced = (key === lastPlacedTileKey);
            drawHexTile(ctx, screenX, screenY, tile, currentZoomLevel, false, false, isLastPlaced);

            // Highlight if in removal mode and tile is one of the surrounded ones
            if (isRemovingTiles && currentSurroundedTilesForRemoval.some(st => st.id === tile.id)) {
            // Pulsing logic for removal highlight
                const currentTime = Date.now();
                const elapsedTime = (currentTime - pulseStartTime) % PULSE_DURATION;
            const baseLineWidth = (2 + 5) / 2; // minPulseWidth = 2, maxPulseWidth = 5
            const amplitude = (5 - 2) / 2;
                const animatedWidth = baseLineWidth + amplitude * Math.sin((elapsedTime / PULSE_DURATION) * 2 * Math.PI);
                ctx.lineWidth = animatedWidth * currentZoomLevel;
            ctx.strokeStyle = 'red';

                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = Math.PI / 180 * (60 * i);
                const vx = screenX + scaledHexSideLength * Math.cos(angle);
                const vy = screenY + scaledHexSideLength * Math.sin(angle);
                if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
                }
                ctx.closePath();
                ctx.stroke();
            }
        }

    // --- Draw AI Evaluation Highlight ---
    if (aiEvaluatingDetails && aiEvaluatingDetails.tile) {
        const evalTileData = aiEvaluatingDetails.tile;
        const evalX = aiEvaluatingDetails.x;
        const evalY = aiEvaluatingDetails.y;

        // Create a temporary HexTile instance for drawing
        const tempEvalTile = new HexTile(evalTileData.id, evalTileData.playerId, [...evalTileData.edges]);
        tempEvalTile.orientation = evalTileData.orientation; // Use orientation from aiEvaluatingDetails

        const evalScreenX = currentOffsetX + scaledHexSideLength * (3/2 * evalX);
        const evalScreenY = currentOffsetY + scaledHexSideLength * (Math.sqrt(3)/2 * evalX + Math.sqrt(3) * evalY);

        // 1. Draw the translucent tile
        ctx.save();
        ctx.globalAlpha = 0.5; // Make it quite translucent
        drawHexTile(ctx, evalScreenX, evalScreenY, tempEvalTile, currentZoomLevel, true); // true for transparent background
        ctx.restore();

        // The purple border drawing logic has been removed.
        // Only the translucent tile will be shown as the AI evaluation highlight.
    }

    // --- Draw Score Animations ---
    // if (activeScoreAnimations.length > 0) { // Entire block for "+1" text animation removed
    //     const currentTime = Date.now();
    //     activeScoreAnimations = activeScoreAnimations.filter(anim => {
    //         const elapsedTime = currentTime - anim.startTime;
    //         if (elapsedTime >= anim.duration) {
    //             if (anim.onComplete) anim.onComplete();
    //             return false; // Remove from list
    //         }
    //
    //         const progress = elapsedTime / anim.duration;
    //         const floatDistance = 30 * currentZoomLevel; // How far the text floats up
    //         const currentY = anim.y - (progress * floatDistance);
    //         const opacity = 1 - progress;
    //
    //         ctx.save();
    //         ctx.globalAlpha = opacity;
    //         ctx.fillStyle = anim.color;
    //         const fontSize = 16 * currentZoomLevel; // Scaled font size
    //         ctx.font = `bold ${fontSize}px Arial`;
    //         ctx.textAlign = 'center';
    //         ctx.fillText(anim.text, anim.x, currentY);
    //         ctx.restore();
    //         return true; // Keep in list
    //     });
    // }
    }

    // --- Score Highlight Function ---
    function highlightMatchedTriangles(matchedPairs) {
        // This function is for *gaining* points.
        // It will use the shared pulsing mechanism.
        const PULSE_ANIMATION_DURATION = 500; // Duration for score gain pulse

        const trianglesToPulse = matchedPairs.flatMap(pair => [
            { x: pair.tile1.x, y: pair.tile1.y, edgeIndex: pair.tile1.edgeIndex, pulseIntensity: 0 },
            { x: pair.tile2.x, y: pair.tile2.y, edgeIndex: pair.tile2.edgeIndex, pulseIntensity: 0 }
        ]);

        // Call the generic pulsing function without a callback as score gain sequence handles timing separately.
        executePulseAnimation(trianglesToPulse, PULSE_ANIMATION_DURATION);
    }

    function pulseBrokenConnections(brokenPairs, callback) {
        // This function is for *losing* points (tile pop).
        // It will use the shared pulsing mechanism and then execute a callback.
        const PULSE_ANIMATION_DURATION = 1000; // Potentially longer duration for losing points, or keep same as gain.

        const trianglesToPulse = brokenPairs.flatMap(pair => [
            // For broken pairs, one side is the tile being popped, the other is its former neighbor.
            // Both sides of the broken connection should pulse.
            { x: pair.tile1.x, y: pair.tile1.y, edgeIndex: pair.tile1.edgeIndex, pulseIntensity: 0 }, // The popped tile's edge
            { x: pair.tile2.x, y: pair.tile2.y, edgeIndex: pair.tile2.edgeIndex, pulseIntensity: 0 }  // The neighbor's edge
        ]);
        console.log("Initiating pulse for broken connections:", trianglesToPulse);
        executePulseAnimation(trianglesToPulse, PULSE_ANIMATION_DURATION, callback);
    }

    // Generic function to execute the pulsing animation
    function executePulseAnimation(trianglesDetails, duration, callback) {
        const pulseStartTime = Date.now();
        currentlyHighlightedTriangles = trianglesDetails; // Assign to global for drawing

        function pulseLoop() {
            const elapsedTime = Date.now() - pulseStartTime;
            if (elapsedTime >= duration) {
                currentlyHighlightedTriangles = []; // Clear highlights
                isPulsingGlobal = false; // Stop this specific pulse effect
                redrawBoardOnCanvas(); // Final redraw to clear

                // Check if other animations (like view panning/zooming) still need to run
                // This check is important if animateView was only running due to this pulse.
                if (needsViewAnimation() || activeScoreAnimations.length > 0) {
                    if(!animationFrameId) animateView(); // Restart main loop if it stopped
                }

                if (callback) {
                    callback(); // Execute callback after animation completes
                }
                return;
            }

            const progress = elapsedTime / duration;
            const intensity = Math.sin(progress * Math.PI); // sin(0) = 0, sin(PI/2) = 1, sin(PI) = 0
            currentlyHighlightedTriangles.forEach(ht => ht.pulseIntensity = intensity);

            isPulsingGlobal = true; // Signal that an animation is active
            if (!animationFrameId) { // If main animation loop isn't running, start it.
                animateView();
            } else {
                // If animateView is already running, it will pick up the redraw due to isPulsingGlobal.
                // Forcing a redraw here can ensure immediate update if animateView's timing is slightly off.
                // However, it's generally better to let animateView manage redraws.
                // redrawBoardOnCanvas(); // Optional: force redraw
            }
            requestAnimationFrame(pulseLoop);
        }

        pulseLoop(); // Start the animation.
    }


    function getEdgeMidpointScreenCoords(tileX, tileY, edgeIndex, currentZoom, currentOffsetX, currentOffsetY) {
        const sideLength = BASE_HEX_SIDE_LENGTH * currentZoom;
        // Calculate center of the hex tile on screen
        const hexCenterX = currentOffsetX + sideLength * (3/2 * tileX);
        const hexCenterY = currentOffsetY + sideLength * (Math.sqrt(3)/2 * tileX + Math.sqrt(3) * tileY);

        // Get vertices of the edge
        const angle1 = Math.PI / 180 * (60 * edgeIndex);
        const v1x = hexCenterX + sideLength * Math.cos(angle1);
        const v1y = hexCenterY + sideLength * Math.sin(angle1);

        const angle2 = Math.PI / 180 * (60 * ((edgeIndex + 1) % 6));
        const v2x = hexCenterX + sideLength * Math.cos(angle2);
        const v2y = hexCenterY + sideLength * Math.sin(angle2);

        // Midpoint of the edge
        const midX = (v1x + v2x) / 2;
        const midY = (v1y + v2y) / 2;

        return { x: midX, y: midY };
    }

    // scoreDelta is positive for gain, negative for loss (though we pass absolute count for items)
    // itemsList is matchedPairs for gains, brokenPairs for losses
    // textToShow is "+1" or "-1"
    function animateScoreChangeOnBoard(playerId, itemsList, textToShow, callback) {
        // The functionality for showing "+1" text has been removed.
        // This function might still be called in the scoring sequence.
        // We will just call the callback directly if it exists.
        // The `activeScoreAnimations` array and its processing in `redrawBoardOnCanvas`
        // have also been commented out/removed.

        // Ensure `isPulsingGlobal` and `needsViewAnimation` are still checked
        // if `animateView` needs to be called for other reasons, though typically
        // the score highlight itself will handle that.
        // For now, just call the callback.
        if (callback) {
            callback();
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

        // boardState = {}; // Reset board state // <--- THIS LINE IS REMOVED to preserve loaded state
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


        // boardState = {}; // Reset board state // <--- THIS LINE IS REMOVED to preserve loaded state
        // The old cell creation loop is removed.
        // Event listeners for drag/drop on cells are removed.
        // Click handling will be added directly to the canvas later.
        console.log("Game board canvas initialized and cleared.");
        redrawBoardOnCanvas(); // Ensure board is drawn (empty at this stage)
    }

    // --- Canvas Drawing Functions ---
    const BASE_HEX_SIDE_LENGTH = 40; // pixels - This is the reference size at zoom 1.0
    const HAND_TILE_BASE_SIDE_LENGTH = 28; // pixels - Smaller size for hand tiles
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
    // isSelected: if true, draws a selection highlight (typically for hand tiles)
    // isRaisedEffect: if true, draws an outer shadow to make the tile look raised (for last placed board tile)
    function drawHexTile(ctx, cx, cy, tile, zoom = 1.0, transparentBackground = false, isSelected = false, isRaisedEffect = false) {
        const orientedEdges = tile.getOrientedEdges();
        const sideLength = BASE_HEX_SIDE_LENGTH * zoom;

        let originalShadowColor, originalShadowBlur, originalShadowOffsetX, originalShadowOffsetY;
        let raisedEffectApplied = false;

        if (isRaisedEffect && !isSelected) { // Apply raised effect only if not also having selection glow
            // It's better to save and restore the entire context for robust shadow application
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
            ctx.shadowBlur = 5 * zoom;
            ctx.shadowOffsetX = 2 * zoom;
            ctx.shadowOffsetY = 2 * zoom;
            raisedEffectApplied = true;
        }

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

        if (raisedEffectApplied) {
            ctx.restore(); // Restore context to remove raised shadow effect before drawing edges/indicators
        }

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

                // Check if this specific triangle edge should be highlighted for pulsing shadow
                const highlightInfo = currentlyHighlightedTriangles.find(ht => {
                    return ht.x === tile.x && ht.y === tile.y && ht.edgeIndex === i;
                });

                if (highlightInfo && highlightInfo.pulseIntensity > 0) {
                    ctx.save();
                    ctx.shadowColor = tile.getPlayerColor; // Shadow color same as triangle
                    ctx.shadowBlur = highlightInfo.pulseIntensity * 10 * zoom; // Intensity controls blur
                    ctx.shadowOffsetX = 0; // No offset for a glow effect
                    ctx.shadowOffsetY = 0;

                    // Redraw the triangle path to apply the shadow.
                    // The fill of this path will cast the shadow.
                    // We don't stroke it here, as the shadow is cast by the fill.
                    ctx.fillStyle = tile.getPlayerColor; // Fill must be opaque to cast shadow
                    ctx.beginPath();
                    ctx.moveTo(tipX, tipY);
                    ctx.lineTo(base1X, base1Y);
                    ctx.lineTo(base2X, base2Y);
                    ctx.closePath();
                    ctx.fill(); // This fill casts the shadow

                    ctx.restore(); // Restore context to remove shadow for subsequent drawings
                }

            } else { // Blank edge
                ctx.beginPath();
                ctx.moveTo(v1.x, v1.y); // Corrected from v2.y
                ctx.lineTo(v2.x, v2.y);
                ctx.strokeStyle = 'grey';
                ctx.lineWidth = 2 * zoom; // Scale line width
                ctx.stroke();
            }
        }

        // Draw selection highlight if isSelected is true
        if (isSelected) {
        // Save current context state if further fine-tuning of shadow reset is needed
        // ctx.save();

        ctx.shadowColor = 'gray';
        ctx.shadowBlur = 6 * zoom; // Adjusted blur for a "thicker" feel, scales with zoom
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // The stroke that casts the shadow.
        // Its line width contributes to the perceived thickness of the highlight.
        // A thinner line with a larger blur gives a softer glow.
        // A thicker line with less blur gives a more solid highlight.
        ctx.strokeStyle = 'black'; // Color of the line that will cast the shadow
        ctx.lineWidth = 1 * zoom;   // A thin line, relying on shadow for thickness

        // Redraw the hexagon path for the highlight shadow
        // This stroke itself will be mostly to cast the shadow.
            ctx.beginPath();
            ctx.moveTo(vertices[0].x, vertices[0].y);
            for (let i = 1; i < 6; i++) {
                ctx.lineTo(vertices[i].x, vertices[i].y);
            }
            ctx.closePath();
            ctx.stroke();

        // Reset shadow properties immediately after drawing the shadowed element
        // to prevent subsequent drawings from having this shadow.
        ctx.shadowColor = 'transparent'; // Or 'rgba(0,0,0,0)'
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // ctx.restore(); // If ctx.save() was used
        }
    }


    // --- Display Logic ---
    function displayPlayerHand(player, hand, handDisplayElement) {
        handDisplayElement.innerHTML = ''; // Clear previous tiles
        hand.forEach(tile => {
            const tileCanvas = document.createElement('canvas');
            // Use HAND_TILE_BASE_SIDE_LENGTH for hand tiles.
            const handTileSideLength = HAND_TILE_BASE_SIDE_LENGTH;
            const handHexWidth = 2 * handTileSideLength;
            const handHexHeight = Math.sqrt(3) * handTileSideLength;

            // Add some padding to the canvas to ensure tile edges aren't cut off,
            // especially if drawHexTile draws slightly outside the strict hex dimensions.
            // A padding of 5px around the hex should be sufficient.
            const canvasPadding = 5 * 2; // 5px on each side
            tileCanvas.width = handHexWidth + canvasPadding;
            tileCanvas.height = handHexHeight + canvasPadding;
            tileCanvas.style.cursor = 'pointer';
            tileCanvas.style.margin = '2px'; // Reduced margin

            const tileCtx = tileCanvas.getContext('2d');
            const cx = tileCanvas.width / 2;
            const cy = tileCanvas.height / 2;

            // Draw hand tile using HAND_TILE_BASE_SIDE_LENGTH.
            // The drawHexTile function's `zoom` parameter is relative to its
            // internal BASE_HEX_SIDE_LENGTH. To draw with our new hand tile size,
            // we effectively pass a "zoom" factor that scales BASE_HEX_SIDE_LENGTH
            // down to HAND_TILE_BASE_SIDE_LENGTH.
            // zoomFactor = HAND_TILE_BASE_SIDE_LENGTH / BASE_HEX_SIDE_LENGTH
            // However, drawHexTile is designed to take an absolute sideLength for its calculations
            // if we consider its `sideLength` variable: `const sideLength = BASE_HEX_SIDE_LENGTH * zoom;`
            // So, we should call it with a zoom factor that makes `BASE_HEX_SIDE_LENGTH * zoom = HAND_TILE_BASE_SIDE_LENGTH`.
            // Thus, zoom = HAND_TILE_BASE_SIDE_LENGTH / BASE_HEX_SIDE_LENGTH.
            // OR, more simply, modify drawHexTile to accept an optional sideLength override,
            // or ensure it correctly uses the passed zoom with its BASE_HEX_SIDE_LENGTH.

            // Let's adjust the call to drawHexTile:
            // The `drawHexTile` function's first parameter for side length calculation is `zoom`.
            // It calculates `const sideLength = BASE_HEX_SIDE_LENGTH * zoom;`
            // So, if we want the drawn `sideLength` to be `HAND_TILE_BASE_SIDE_LENGTH`,
            // we need to pass `zoom = HAND_TILE_BASE_SIDE_LENGTH / BASE_HEX_SIDE_LENGTH`.
            const zoomForHandTile = HAND_TILE_BASE_SIDE_LENGTH / BASE_HEX_SIDE_LENGTH;
            drawHexTile(tileCtx, cx, cy, tile, zoomForHandTile);
            tileCanvas.dataset.tileId = tile.id; // Store tile ID on the canvas element

            tileCanvas.addEventListener('click', () => {
                // Pass the tile object and the canvas element itself for potential highlighting
                // Find the tile from hand again, to ensure freshness, though closure 'tile' should be fine here.
                const clickedTileId = tileCanvas.dataset.tileId;
                const currentHand = (player === 1) ? player1Hand : player2Hand;
                const freshTile = currentHand.find(t => t.id === clickedTileId);
                if (freshTile) {
                    selectTileFromHand(freshTile, tileCanvas, player);
                } else {
                    console.error("Clicked tile not found in hand for click event:", clickedTileId);
                }
            });

            // Make the canvas tile draggable
            tileCanvas.draggable = true;
            tileCanvas.addEventListener('dragstart', (event) => {
                const draggedTileId = event.target.dataset.tileId;
                const currentHand = (player === 1) ? player1Hand : player2Hand;
                const tileToDrag = currentHand.find(t => t.id === draggedTileId);

                if (!tileToDrag) {
                    console.error("Could not find tile to drag by ID for dragstart:", draggedTileId);
                    event.preventDefault(); // Prevent drag if tile not found
                    return;
                }

                // Call selectTileFromHand to set the selectedTile.
                // The visual feedback of selection (border) will be applied by selectTileFromHand.
                selectTileFromHand(tileToDrag, event.target, player, true); // Pass true for isDragStart, use event.target

                // Create a temporary canvas for the drag image
                const tempDragCanvas = document.createElement('canvas');

                // Use BASE_HEX_SIDE_LENGTH * currentZoomLevel for the drag image side length
                // This makes the drag image match the current size of tiles on the board.
                const dragImageSideLength = BASE_HEX_SIDE_LENGTH * currentZoomLevel;
                let hexTrueWidth = 2 * dragImageSideLength;
                let hexTrueHeight = Math.sqrt(3) * dragImageSideLength;

                // Set canvas to exact dimensions of the hexagon.
                tempDragCanvas.width = hexTrueWidth;
                tempDragCanvas.height = hexTrueHeight;

                // Style it to be off-screen and append to body
                tempDragCanvas.style.position = 'absolute';
                tempDragCanvas.style.left = '-9999px';
                document.body.appendChild(tempDragCanvas); // Append to body to make it a valid image source

                const tempCtx = tempDragCanvas.getContext('2d');

                // Draw the hexagon centered on this new canvas.
                // The zoom factor passed to drawHexTile should be currentZoomLevel,
                // as drawHexTile uses BASE_HEX_SIDE_LENGTH as its reference.
                drawHexTile(tempCtx, tempDragCanvas.width / 2, tempDragCanvas.height / 2, tileToDrag, currentZoomLevel, false);

                // Set the custom drag image
                // The offset should be where the cursor is relative to the top-left of the drag image.
                // To center the image under the cursor:
                const offsetX = tempDragCanvas.width / 2;
                const offsetY = tempDragCanvas.height / 2;
                event.dataTransfer.setDragImage(tempDragCanvas, offsetX, offsetY);

                // It's good practice to clean up the temporary canvas.
                // Using setTimeout to ensure the browser has processed the drag image.
                setTimeout(() => {
                    if (document.body.contains(tempDragCanvas)) {
                        document.body.removeChild(tempDragCanvas);
                    }
                }, 0);
                // For now, let's assume not appending it is fine as per MDN docs (it can be any canvas).

                // Optionally, set data for drag event if needed elsewhere, though selectedTile might be sufficient.
                event.dataTransfer.setData('text/plain', tile.id); // Crucial for Safari and can affect Chrome's drag icon
                // event.target.style.opacity = '0.4'; // Example of making original more transparent
            });

            // event.addEventListener('dragend', (event) => { // Optional: reset opacity if changed in dragstart
            //     event.target.style.opacity = '1';
            // });

            handDisplayElement.appendChild(tileCanvas);
        });
    }

    // The createTileElement function is now obsolete as hand tiles are rendered on canvas elements.
    // And board tiles are also rendered directly on the main game canvas.
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
    function initializeGame(isReset = false) { // Added isReset parameter
        console.log(`Attempting to initialize game... Reset flag: ${isReset}`);
        let loadedState = null;

        if (!isReset) { // Only attempt to load from URL if not a reset
            const urlParams = new URLSearchParams(window.location.search);
            const gameStateParam = urlParams.get('gameState');

            if (gameStateParam) {
                console.log("Found gameState parameter in URL. Attempting to load.");
                loadedState = deserializeGameStateFromString(decodeURIComponent(gameStateParam));
                if (loadedState) {
                    console.log("Successfully deserialized game state from URL.");
                    // Apply the loaded state
                    boardState = loadedState.boardState;
                    player1Hand = loadedState.player1Hand;
                    player2Hand = loadedState.player2Hand;
                    currentPlayer = loadedState.currentPlayer;
                    player1Score = loadedState.player1Score;
                    player2Score = loadedState.player2Score;
                    opponentType = loadedState.opponentType;
            player1GameMode = loadedState.player1GameMode || "basic"; // Load P1 game mode
            player1MadeFirstMove = loadedState.player1MadeFirstMove || false; // Load P1 first move status
            player2GameMode = loadedState.player2GameMode || "basic"; // Load P2 game mode
            player2MadeFirstMove = loadedState.player2MadeFirstMove || false; // Load P2 first move status
                    isRemovingTiles = loadedState.isRemovingTiles;
                    currentSurroundedTilesForRemoval = loadedState.currentSurroundedTilesForRemoval;
                    lastPlacedTileKey = loadedState.lastPlacedTileKey;
                    // Note: selectedTile is intentionally not restored from URL to avoid complex UI state.
                    // User will need to re-select a tile if they were in the middle of a move.
                    selectedTile = null;
                    aiEvaluatingDetails = null; // Reset this on any load
                    console.log("Game state loaded from URL.");
                } else {
                    console.warn("Failed to deserialize game state from URL, or state was null. Starting a new game.");
                    // Fall through to default initialization
                }
            }
        } else {
            console.log("Resetting game: Skipping URL parameter check.");
        }

        if (!loadedState || isReset) { // If no state loaded from URL OR if it's a reset, initialize a new game
            console.log("No valid game state in URL or loading failed. Initializing a new game.");
            player1Hand = generateUniqueTilesForPlayer(1, NUM_TILES_PER_PLAYER);
            player1Hand = generateUniqueTilesForPlayer(1, NUM_TILES_PER_PLAYER);
            player2Hand = generateUniqueTilesForPlayer(2, NUM_TILES_PER_PLAYER);
            currentPlayer = 1;
            player1Score = 0;
            player2Score = 0;
            selectedTile = null;
            boardState = {};
            isRemovingTiles = false;
            currentSurroundedTilesForRemoval = [];
            lastPlacedTileKey = null;
            aiEvaluatingDetails = null;
            opponentType = "greedy"; // Default opponent type for new games
            player1GameMode = "basic"; // Reset P1 game mode for new games
            player1MadeFirstMove = false; // Reset P1 first move status for new games
            player2GameMode = "basic"; // Reset P2 game mode for new games
            player2MadeFirstMove = false; // Reset P2 first move status for new games


            // Initialize toast notification state variables
            isFirstTurn = true; // Tracks if the *very first tile of the game* has been placed
            playerHasRotatedTileThisGame = {1: false, 2: false};
        }

        // Common initialization steps regardless of new or loaded game:

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

        // Hide the game over banner
        if (gameOverBanner) {
            gameOverBanner.classList.add('hidden');
            // Or gameOverBanner.style.display = 'none';
        }

        gameInitialized = true;
        console.log("Game initialized. Player 1 hand:", player1Hand, "Player 2 hand:", player2Hand);

        updateViewParameters(); // Calculate initial target view
        // Set current to target for the first draw and call animateView to start the loop if needed (e.g. if initial targets differ)
        currentOffsetX = targetOffsetX; // Start at target for first frame
        currentOffsetY = targetOffsetY;
        currentZoomLevel = targetZoomLevel;
        // redrawBoardOnCanvas(); // animateView will handle the first draw
        animateView(); // Start animation loop (will draw immediately if no animation needed)
        resizeCanvas(); // Call after full initialization
        updateURLWithGameState(); // Set initial game state in URL
    }

    // --- Web Worker Setup ---
    let aiWorker;
    if (window.Worker) {
        aiWorker = new Worker('aiWorker.js');
        aiWorker.onmessage = function(e) {
            // console.log('[Main] Message received from worker:', e.data);
            const { task, move, tileToRemove, moveData } = e.data; // Added moveData

            if (task === 'aiMoveResult') {
                aiEvaluatingDetails = null; // Clear evaluation highlight
                redrawBoardOnCanvas(); // Ensure it's cleared visually
                handleAiMoveResult(move);
            } else if (task === 'aiTileRemovalResult') {
                handleAiTileRemovalResult(tileToRemove);
            } else if (task === 'aiEvaluatingMove') {
                aiEvaluatingDetails = moveData;
                redrawBoardOnCanvas(); // Redraw to show the new highlight
            } else if (task === 'aiClearEvaluationHighlight') {
                aiEvaluatingDetails = null;
                redrawBoardOnCanvas();
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

    function selectTileFromHand(tile, tileCanvasElement, playerId, isDragStart = false) {
        if (playerId !== currentPlayer) {
            console.log("It's not your turn!");
            return;
        }

        // If a board tile was previously selected, remove its temporary hand representation
        if (selectedTile && selectedTile.isBoardTile && selectedTile.handElement && selectedTile.handElement.parentNode) {
            selectedTile.handElement.remove();
        }

        // Check if the clicked hand tile is already selected AND not a drag start
        if (selectedTile && !selectedTile.isBoardTile && selectedTile.tile.id === tile.id && !isDragStart) {
            selectedTile.tile.rotate();
            playerHasRotatedTileThisGame[currentPlayer] = true;
            console.log(`Hand tile ${selectedTile.tile.id} rotated. New orientation: ${selectedTile.tile.orientation}`);
            const tileCtx = tileCanvasElement.getContext('2d');
            tileCtx.clearRect(0, 0, tileCanvasElement.width, tileCanvasElement.height);
            const zoomForHandTile = HAND_TILE_BASE_SIDE_LENGTH / BASE_HEX_SIDE_LENGTH;
            drawHexTile(tileCtx, tileCanvasElement.width / 2, tileCanvasElement.height / 2, selectedTile.tile, zoomForHandTile, false, true);
            updatePlacementHighlights();
        } else {
            // New selection or switching from another tile (hand or board)
            if (currentlySelectedTileCanvas && currentlySelectedTileCanvas !== tileCanvasElement) {
                 // If the PREVIOUS selection was a regular hand tile, redraw it unselected.
                 // If it was a board tile, its temp hand canvas was already removed or will be by selectTileFromBoard.
                if (selectedTile && !selectedTile.isBoardTile && selectedTile.handElement) {
                    const prevCtx = selectedTile.handElement.getContext('2d'); // selectedTile.handElement should be currentlySelectedTileCanvas
                    prevCtx.clearRect(0, 0, selectedTile.handElement.width, selectedTile.handElement.height);
                    const zoomForHandTile = HAND_TILE_BASE_SIDE_LENGTH / BASE_HEX_SIDE_LENGTH;
                    drawHexTile(prevCtx, selectedTile.handElement.width / 2, selectedTile.handElement.height / 2, selectedTile.tile, zoomForHandTile, false, false);
                }
            }

            // Redraw the newly selected hand tile with highlight
            const currentTileCtx = tileCanvasElement.getContext('2d');
            currentTileCtx.clearRect(0, 0, tileCanvasElement.width, tileCanvasElement.height);
            const zoomForHandTile = HAND_TILE_BASE_SIDE_LENGTH / BASE_HEX_SIDE_LENGTH;
            drawHexTile(currentTileCtx, tileCanvasElement.width / 2, tileCanvasElement.height / 2, tile, zoomForHandTile, false, true);

            currentlySelectedTileCanvas = tileCanvasElement;

            // Update selectedTile global variable
            selectedTile = {
                tile: tile,
                handElement: tileCanvasElement,
                originalPlayerId: playerId,
                isBoardTile: false // Tiles from hand are not board tiles
            };

            if (!isDragStart || (selectedTile && selectedTile.tile.id !== tile.id)) {
                console.log(`Player ${currentPlayer} selected tile ${tile.id} from hand. Press 'r' or click tile to rotate. Click on the board to place it.`);
            }
            console.log("Selected tile from hand for interaction (click or drag):", selectedTile);
            updatePlacementHighlights(); // Update highlights for board placement

            // Toast notification logic
            if (!isDragStart) { // Only show toast on actual click selection, not drag start
                const currentTileEdges = tile.getOrientedEdges().toString();
                const allTrianglesPattern = UNIQUE_TILE_PATTERNS[UNIQUE_TILE_PATTERNS.length - 1].toString();
                const allBlanksPattern = UNIQUE_TILE_PATTERNS[0].toString();

                const isSpecialTile = currentTileEdges === allTrianglesPattern || currentTileEdges === allBlanksPattern;

                if (!isFirstTurn && !playerHasRotatedTileThisGame[currentPlayer] && !isSpecialTile) {
                    showToast("Tap again to rotate the tile.");
                }
            }
        }
    }

    // Add a global event listener for keydown
    document.addEventListener('keydown', (event) => {
        if (event.key === 'r' || event.key === 'R') {
            if (selectedTile && selectedTile.tile && selectedTile.handElement) {
                selectedTile.tile.rotate();
                playerHasRotatedTileThisGame[currentPlayer] = true; // Update rotation tracker
                console.log(`Tile ${selectedTile.tile.id} rotated by keypress. Player ${currentPlayer} has now rotated. New orientation: ${selectedTile.tile.orientation}`);

                // Re-draw the selected tile in the hand
                const tileCanvas = selectedTile.handElement;
                const tileCtx = tileCanvas.getContext('2d');
                const cx = tileCanvas.width / 2;
                const cy = tileCanvas.height / 2;
                const zoomForHandTile = HAND_TILE_BASE_SIDE_LENGTH / BASE_HEX_SIDE_LENGTH;

                // Clear the specific tile canvas before redrawing
                tileCtx.clearRect(0, 0, tileCanvas.width, tileCanvas.height);
                // Draw with highlight since it's selected, using the correct zoom factor
                drawHexTile(tileCtx, cx, cy, selectedTile.tile, zoomForHandTile, false, true);

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
            console.log("Please select a tile first (from hand or board).");
            return;
        }
        if (selectedTile.originalPlayerId !== currentPlayer) {
            console.log("Error: Tile selection does not match current player.");
            return;
        }

        if (selectedTile.isBoardTile) {
            // --- Attempt to MOVE the tile ---
            const tileMovedSuccessfully = moveTileOnBoard(selectedTile.tile, x, y, selectedTile.originalX, selectedTile.originalY, selectedTile.maxMoveDistance);

            // Always remove the temporary hand representation after a move attempt
            if (selectedTile.handElement && selectedTile.handElement.parentNode) {
                selectedTile.handElement.remove();
            }

            if (tileMovedSuccessfully) {
                selectedTile = null;
                currentlySelectedTileCanvas = null;
                redrawBoardOnCanvas(); // Ensure highlights are cleared
            } else {
                console.log("Invalid move. Tile remains selected from board.");
                // Keep selectedTile so player can try another spot or rotate.
                // Highlights for moving should still be active or re-shown.
                updateMoveHighlights(selectedTile.tile, selectedTile.maxMoveDistance);
                showToast("Invalid move. Try a different spot or rotation."); // Toast for invalid move
            }
        } else {
            // --- Attempt to PLACE a NEW tile (existing logic) ---
            if (placeTileOnBoard(selectedTile.tile, x, y)) {
                if (currentPlayer === 1) {
                    player1Hand = player1Hand.filter(t => t.id !== selectedTile.tile.id);
                } else {
                    player2Hand = player2Hand.filter(t => t.id !== selectedTile.tile.id);
                }
                selectedTile.handElement.remove();
                selectedTile = null;
                currentlySelectedTileCanvas = null;

                if (currentPlayer === 1) {
                    displayPlayerHand(1, player1Hand, player1HandDisplay);
                } else {
                    displayPlayerHand(2, player2Hand, player2HandDisplay);
                }
                updatePlacementHighlights(); // Clear highlights
                processSuccessfulPlacement(lastPlacedTileKey, currentPlayer);
            } else {
                console.log("Invalid placement.");
            }
        }
    }

    function moveTileOnBoard(tileToMove, newX, newY, oldX, oldY, maxDistance) {
        console.log(`Attempting to move tile ${tileToMove.id} from (${oldX},${oldY}) to (${newX},${newY})`);

        // 1. Distance Check
        const dist = (Math.abs(oldX - newX) + Math.abs(oldX + oldY - newX - newY) + Math.abs(oldY - newY)) / 2;
        if (dist > maxDistance) {
            console.log(`Invalid move: Distance ${dist} exceeds max distance ${maxDistance}.`);
            return false;
        }
         // Allow 0-distance move only if tile was rotated (orientation changed)
        if (dist === 0 && tileToMove.orientation === boardState[`${oldX},${oldY}`].orientation) {
             // If tile is at original spot and wasn't rotated, it's not a valid "move".
             // Player should click tile in hand again to rotate or select another action.
             // However, if they clicked the same spot, and it *could* be a rotation, how to differentiate?
             // The problem says "tap to rotate" is on the hand representation.
             // So, clicking the same spot on board means "place it here (no move)" if maxDistance allows.
             // For now, if dist is 0, it means they clicked the same spot.
             // If the tile's orientation has changed via hand-click, this is a valid "move".
             // If maxDistance is 0, this is the *only* valid move (rotation in place).
             console.log("Tile moved 0 spots. Valid if rotated or maxDistance allows.");
        }


        // 2. Target Spot Occupancy (should not be by another tile)
        const targetKey = `${newX},${newY}`;
        const existingTileAtTarget = boardState[targetKey];
        if (existingTileAtTarget && existingTileAtTarget.id !== tileToMove.id) {
            console.log("Invalid move: Target cell is occupied by another tile.");
            return false;
        }

        // 3. Create Temporary Board State for Validation
        const tempBoardState = deepCopyBoardState(boardState);
        delete tempBoardState[`${oldX},${oldY}`]; // Remove tile from old position

        const tempMovedTile = new HexTile(tileToMove.id, tileToMove.playerId, [...tileToMove.edges]);
        tempMovedTile.orientation = tileToMove.orientation; // Use current orientation from selectedTile.tile
        tempMovedTile.x = newX;
        tempMovedTile.y = newY;
        tempBoardState[targetKey] = tempMovedTile;

        // 4. Validate Placement Rules (touching, edge matching, connectivity)
        let touchesExistingTile = false;
        let edgesMatch = true;
        const neighbors = getNeighbors(newX, newY);

        if (Object.keys(tempBoardState).length === 1 && tempBoardState[targetKey]?.id === tileToMove.id) {
            touchesExistingTile = true; // Only tile on board, considered touching "nothing" correctly
        } else if (Object.keys(tempBoardState).length > 1) {
            for (const neighborInfo of neighbors) {
                const neighbor = tempBoardState[`${neighborInfo.nx},${neighborInfo.ny}`];
                if (neighbor && neighbor.id !== tileToMove.id) {
                    touchesExistingTile = true;
                    const newOrientedEdges = tempMovedTile.getOrientedEdges();
                    const neighborOrientedEdges = neighbor.getOrientedEdges();
                    if (newOrientedEdges[neighborInfo.edgeIndexOnNewTile] !== neighborOrientedEdges[neighborInfo.edgeIndexOnNeighborTile]) {
                        edgesMatch = false; break;
                    }
                }
            }
        } else { // Board became empty after removing the tile - should not happen for a move.
             console.warn("Board became empty after removing tile for move validation. This is unexpected.");
             return false; // Or handle as an error.
        }


        if (!touchesExistingTile && Object.keys(tempBoardState).length > 1) {
            console.log("Invalid move: Moved tile must touch an existing tile (if others exist).");
            return false;
        }
        if (!edgesMatch) {
            console.log("Invalid move: Edge mismatch with neighbor.");
            return false;
        }
        if (!isBoardConnected(tempBoardState)) {
            console.log("Invalid move: Board would become disconnected.");
            return false;
        }
        // Note: isSpaceEnclosed check is intentionally omitted for moves, as per rules.

        // --- All checks passed, execute the move ---
        delete boardState[`${oldX},${oldY}`]; // Remove from old position in actual boardState
        tileToMove.x = newX;                 // Update tile's actual coordinates
        tileToMove.y = newY;
        // tileToMove.orientation is already updated if player rotated it via handElement
        boardState[targetKey] = tileToMove;  // Add to new position in actual boardState
        lastPlacedTileKey = targetKey;       // Treat moved tile as "last placed" for scoring, etc.

        console.log(`Tile ${tileToMove.id} successfully moved to (${newX},${newY}). Orientation: ${tileToMove.orientation}`);
        redrawBoardOnCanvas();
        processSuccessfulPlacement(lastPlacedTileKey, currentPlayer); // Reuse scoring and turn logic
        return true;
    }

    // New function to process successful placement and subsequent actions
function processSuccessfulPlacement(placedTileKey, playerOfTurn) {
    const { scoreDelta, matchedPairs, scoringPlayerId } = calculateScoresForBoard(boardState, placedTileKey);

    if (scoreDelta > 0 && scoringPlayerId === playerOfTurn) {
        let oldPlayerScore;
        if (playerOfTurn === 1) {
            oldPlayerScore = player1Score;
            player1Score += scoreDelta; // Update score model immediately
        } else { // playerOfTurn === 2
            oldPlayerScore = player2Score;
            player2Score += scoreDelta; // Update score model immediately
        }
        const newPlayerScore = (playerOfTurn === 1) ? player1Score : player2Score;

        highlightMatchedTriangles(matchedPairs); // This starts the pulse animation

        // The pulse animation (highlightMatchedTriangles) runs for its duration.
        // After the pulse, we want to animate the scoreboard.
        // We need a way for highlightMatchedTriangles to signal completion or wait for it.
        // For now, let's assume highlightMatchedTriangles takes about 1000ms.
        // Then, animateScoreChangeOnBoard (now a passthrough) will lead to scoreboard update.

        // Sequence:
        // 1. highlightMatchedTriangles (pulse visual, runs for ~1000ms)
        // 2. animateScoreChangeOnBoard (acts as a delayer/sequencer via its callback)
        // 3. animateScoreboardUpdate (updates the score display)
        // 4. checkForSurroundedTilesAndProceed (game logic continuation)

        // To ensure scoreboard animation starts after pulse, we can delay its chain.
        // The pulse itself is visual and doesn't have a direct callback.
        // Let's use a timeout that matches the pulse duration.
        setTimeout(() => {
            animateScoreChangeOnBoard(playerOfTurn, matchedPairs, "+1", () => { // textToShow is now ignored
                // Callback after animateScoreChangeOnBoard (which is immediate)
                animateScoreboardUpdate(playerOfTurn, newPlayerScore, oldPlayerScore, () => {
                    // Callback after scoreboard animation is done
                    if (p1ScoreDisplayFloater) p1ScoreDisplayFloater.textContent = player1Score;
                    if (p2ScoreDisplayFloater) p2ScoreDisplayFloater.textContent = player2Score;

                    checkForSurroundedTilesAndProceed();
                    updateViewParameters();
                    animateView();
                });
            });
        }, 1000); // Delay matches PULSE_ANIMATION_DURATION in highlightMatchedTriangles

    } else {
        // No score change from this placement
        checkForSurroundedTilesAndProceed();
        updateViewParameters();
        animateView();
    }
    updateURLWithGameState(); // Update URL after a tile placement is fully processed
        }


    function placeTileOnBoard(tile, x, y) {
        if (!isPlacementValid(tile, x, y)) {
            return false;
        }

        tile.x = x;
        tile.y = y;
        boardState[`${x},${y}`] = tile;
        lastPlacedTileKey = `${x},${y}`; // Update the last placed tile key

        // Visual update will be handled by a dedicated drawing function that iterates boardState
        // and draws all tiles on the canvas. This function will be called after successful placement.
        console.log(`Tile ${tile.id} placed at ${x},${y}. Board state updated. Last placed key: ${lastPlacedTileKey}`);

        // Update isFirstTurn state variable (tracks if the *very first tile of the game* has been placed)
        if (isFirstTurn) { // This refers to the overall game's first turn
            isFirstTurn = false;
            console.log("The first tile of the game has been placed.");
        }

        // Specifically for Player 1's first move and locking the toggle
        if (currentPlayer === 1 && !player1MadeFirstMove) {
            player1MadeFirstMove = true;
            console.log("Player 1 has made their first move. Game mode toggle will be locked.");
            const p1ModeToggle = document.getElementById('player1-game-mode');
            if (p1ModeToggle) {
                p1ModeToggle.disabled = true;
                p1ModeToggle.classList.add('locked-toggle'); // For potential specific styling
            }
        } else if (currentPlayer === 2 && !player2MadeFirstMove) {
            player2MadeFirstMove = true;
            console.log("Player 2 has made their first move. Game mode toggle will be locked.");
            const p2ModeToggle = document.getElementById('player2-game-mode');
            if (p2ModeToggle) {
                p2ModeToggle.disabled = true;
                p2ModeToggle.classList.add('locked-toggle'); // For potential specific styling
            }
        }

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
            // isRemovingTiles = true; // This will be set true inside processTileRemoval
                processTileRemoval(surroundedTiles);
            } else {
            isRemovingTiles = false;
            isPulsingGlobal = false; // Ensure pulsing stops if no tiles were surrounded initially
                calculateAndUpdateTotalScores(); // Update scores after each turn
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
            pulseStartTime = Date.now(); // Start pulsing
            isPulsingGlobal = true;
            animateView(); // Ensure animation loop is running for pulsing
            console.log("Tile removal phase. Surrounded tiles:", currentSurroundedTilesForRemoval.map(t => t.id));

            if (currentPlayer === 2 && ['random', 'greedy', 'greedy2', 'greedy4'].includes(opponentType)) {
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
            calculateAndUpdateTotalScores();
            if (checkGameEnd()) {
                endGame();
            } else {
                switchTurn();
            }
        }
    }


    function switchTurn() {
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        aiEvaluatingDetails = null; // Clear any AI evaluation highlight when turn switches
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
        if (selectedTile && currentlySelectedTileCanvas) {
            // Redraw the previously selected tile without highlight before clearing selection
            const tileCtx = currentlySelectedTileCanvas.getContext('2d');
            tileCtx.clearRect(0, 0, currentlySelectedTileCanvas.width, currentlySelectedTileCanvas.height);
            // We need the tile object itself. selectedTile.tile should be correct.
            // Use the correct zoom factor for hand tiles.
            const zoomForHandTile = HAND_TILE_BASE_SIDE_LENGTH / BASE_HEX_SIDE_LENGTH;
            drawHexTile(tileCtx, currentlySelectedTileCanvas.width / 2, currentlySelectedTileCanvas.height / 2, selectedTile.tile, zoomForHandTile, false, false);

            currentlySelectedTileCanvas = null;
            selectedTile = null;
            updatePlacementHighlights(); // Clear board highlights
        } else if (selectedTile) {
            // If selectedTile exists but currentlySelectedTileCanvas doesn't (should be rare),
            // still nullify selectedTile and update highlights.
            selectedTile = null;
            updatePlacementHighlights();
        }

        // Moved renderPlayerHands earlier so player2HandContainer is correctly defined before pulse class is added.
        renderPlayerHands();

        // Check if AI needs to make a move or remove a tile
        const aiOpponentTypes = ['random', 'greedy', 'greedy2', 'greedy4'];
        if (currentPlayer === 2 && !isRemovingTiles && aiOpponentTypes.includes(opponentType)) {
            console.log("Player 2 (AI) is thinking... (via switchTurn)");
            if (player2HandContainer) player2HandContainer.classList.add('ai-thinking-pulse');
            initiateAiMove();
        } else if (currentPlayer === 2 && isRemovingTiles && aiOpponentTypes.includes(opponentType)) {
            console.log("Player 2 (AI) is choosing a tile to remove... (via switchTurn)");
            if (player2HandContainer) player2HandContainer.classList.add('ai-thinking-pulse');
            initiateAiTileRemoval();
        }
        updateURLWithGameState(); // Update URL after turn switch and before AI might act
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
        aiEvaluatingDetails = null; // Clear previous evaluation details before starting new AI move
        redrawBoardOnCanvas(); // Visually clear the highlight immediately

        // Ensure hands and boardState are plain data for the worker
        const plainPlayer1Hand = player1Hand.map(tile => ({ id: tile.id, playerId: tile.playerId, edges: [...tile.edges], orientation: tile.orientation }));
        const plainPlayer2Hand = player2Hand.map(tile => ({ id: tile.id, playerId: tile.playerId, edges: [...tile.edges], orientation: tile.orientation }));
        const plainBoardState = {};
        for (const key in boardState) {
            const tile = boardState[key];
            plainBoardState[key] = { id: tile.id, playerId: tile.playerId, edges: [...tile.edges], orientation: tile.orientation, x: tile.x, y: tile.y };
        }

        const urlParams = new URLSearchParams(window.location.search);
        const debugFlag = urlParams.get('debug') === '1';

        aiWorker.postMessage({
            task: 'aiMove',
            boardState: plainBoardState,
            player1Hand: plainPlayer1Hand, // Opponent's hand for Minimax
            player2Hand: plainPlayer2Hand, // AI's hand
            opponentType: opponentType,
            currentPlayerId: currentPlayer, // Should be 2
            debug: debugFlag // Pass the debug flag
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

                // Call the new centralized function to handle scoring, animations, and game progression
                // lastPlacedTileKey is updated by placeTileOnBoard, currentPlayer should be 2 for AI
                processSuccessfulPlacement(lastPlacedTileKey, 2);

                // The old logic for checkForSurroundedTilesAndProceed, updateViewParameters, and animateView
                // is now handled within processSuccessfulPlacement or its subsequent calls.
                // The specific logic for AI-caused surrounding and delayed removal initiation
                // that was here:
                // const surroundedAfterAiMove = getSurroundedTiles(boardState);
                // if (surroundedAfterAiMove.length > 0) { ... } else { ... }
                // This will now be handled by checkForSurroundedTilesAndProceed called within processSuccessfulPlacement.
                // checkForSurroundedTilesAndProceed already contains logic to initiate AI tile removal
                // if it's AI's turn and tiles are surrounded.
            } else {
                // The error message now correctly reflects the orientation being used.
                console.error(`[Main] AI (${opponentType}) failed to place tile ${tileToPlace.id} (orientation: ${tileToPlace.orientation}) at (${move.x}, ${move.y}). This should ideally be caught by worker's validation.`);
                switchTurn();
            }
        } else {
            console.log(`[Main] AI (${opponentType}) could not find any valid move, passed, or move object was malformed. Passing turn. Move received:`, move);
            calculateAndUpdateTotalScores();
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
                // Simulate haptic feedback for AI "tap"
                console.log(`[Main] AI conceptually 'tapped' tile ${actualTileToRemove.id} for removal. Triggering simulated haptic feedback.`);
                if (navigator.maxTouchPoints > 0 && typeof navigator.vibrate === 'function') {
                    navigator.vibrate(100); // Vibrate for 100ms, same as user tap
                    console.log("[Main] Device vibrated for AI tile removal.");
                }
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
            calculateAndUpdateTotalScores();
            switchTurn();
        }
    }

    function checkGameEnd() {
        // Determine current player's hand and game mode
        const currentPlayersHand = currentPlayer === 1 ? player1Hand : player2Hand;
        const currentGameMode = currentPlayer === 1 ? player1GameMode : player2GameMode;
        const opponentGameMode = currentPlayer === 1 ? player2GameMode : player1GameMode; // For mixed mode games

        if (currentPlayersHand.length === 0) {
            if (currentGameMode === "moving") {
                // "With Moves" mode: game ends if player has no tiles AND is currently winning.
                const currentPlayerScore = currentPlayer === 1 ? player1Score : player2Score;
                const opponentScore = currentPlayer === 1 ? player2Score : player1Score;
                if (currentPlayerScore > opponentScore) {
                    console.log(`Player ${currentPlayer} starts turn with no tiles and is winning (${currentPlayerScore} vs ${opponentScore}) in 'With Moves' mode. Game ends.`);
                    return true; // Win condition met
                } else {
                    console.log(`Player ${currentPlayer} starts turn with no tiles but is NOT winning (${currentPlayerScore} vs ${opponentScore}) in 'With Moves' mode. Game continues, can move tiles.`);
                    return false; // Can still move tiles
                }
            } else {
                // Basic mode: game ends if player has no tiles.
                console.log(`Player ${currentPlayer} starts turn with no tiles in 'Basic' mode. Game ends.`);
                return true;
            }
        }

        // If the opponent is in "moving" mode and has no tiles, and it's *their* turn to start
        // and they were winning, the game would have ended. This check here is more about
        // general empty hands if the above specific "current player starts turn" condition isn't met.
        // The primary rule is about *starting the turn*.
        // However, if *both* players are in basic mode, the old rule (either player runs out)
        // could still be interpreted. Let's stick to "current player starts turn with no tiles".

        return false; // Game does not end based on current player's hand
    }

    function endGame() {
        calculateAndUpdateTotalScores();
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

        // Display the celebratory message to the user using the banner
        if (gameOverBanner) {
            gameOverBanner.textContent = celebratoryMessage;
            gameOverBanner.classList.remove('hidden');
            // Or gameOverBanner.style.display = 'block'; if not using class toggling for visibility
        } else {
            // Fallback if banner element isn't found for some reason
            alert(celebratoryMessage);
        }

        // Disable further moves, or handle via selectedTile being null / hands empty
    }

    // Calculates scores based on a given board state.
    // If forTileKey is provided, it calculates the score delta and matched pairs for that specific tile's placement.
    // Otherwise, it calculates the total score for the entire board.
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

    // Calculates and updates total scores, and can also return delta for a specific placement.
    // This function will primarily be used to update the global scores after animations.
    // For getting delta for animations, call calculateScoresForBoard directly.
    function calculateAndUpdateTotalScores() {
        const scores = calculateScoresForBoard(boardState); // No forTileKey, gets total
        if (scores.player1Score !== undefined) player1Score = scores.player1Score;
        if (scores.player2Score !== undefined) player2Score = scores.player2Score;

        updateGameInfo(); // Updates the scoreboard display
        // console.log(`Total scores updated: P1: ${player1Score}, P2: ${player2Score}`); // Logging done by animateScoreboardUpdate or at end of turn.
    }

    // Calculates the score lost if a specific tile were to be popped.
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


    function animateScoreboardUpdate(playerId, newScore, oldScore, callback) {
        const scoreDisplayElement = playerId === 1 ? p1ScoreDisplayFloater : p2ScoreDisplayFloater;
        if (!scoreDisplayElement) {
            if (callback) callback();
            return;
        }

        const scoreDifference = newScore - oldScore;
        if (scoreDifference === 0) {
            if (callback) callback();
            return;
        }

        const increment = scoreDifference > 0 ? 1 : -1;
        let currentAnimatedScore = oldScore;
        const durationPerPoint = 100; // ms per point change
        const totalDuration = Math.abs(scoreDifference) * durationPerPoint;

        // Optional: Flash effect
        scoreDisplayElement.style.transition = 'transform 0.1s ease-in-out, color 0.1s ease-in-out';
        scoreDisplayElement.style.transform = 'scale(1.2)';
        scoreDisplayElement.style.color = 'gold';


        function updateStep() {
            currentAnimatedScore += increment;
            scoreDisplayElement.textContent = currentAnimatedScore;

            if (currentAnimatedScore !== newScore) {
                setTimeout(updateStep, durationPerPoint);
            } else {
                // Reset visual effect and call callback
                scoreDisplayElement.textContent = newScore; // Ensure final score is accurate
                scoreDisplayElement.style.transform = 'scale(1)';
                scoreDisplayElement.style.color = playerId === 1 ? 'lightblue' : 'lightcoral'; // Reset to player color

                console.log(`Player ${playerId} score animated from ${oldScore} to ${newScore}`);
                if (callback) callback();
            }
        }

        setTimeout(() => { // Start the stepping after the initial flash
            scoreDisplayElement.style.transform = 'scale(1.1)'; // Slightly smaller than peak after the main flash
            // Color reset will happen when the animation step completes or if it was a zero-sum change.
            // For the flash, we want the gold to persist for the 100ms.
            updateStep();
        }, 100); // Duration of initial flash. Gold color persists for this, then step logic takes over.
    }


    // --- Event Listeners ---

function updateViewParameters() {
    const placedTiles = Object.values(boardState);
    const coordsForBoundingBox = new Set();

    if (placedTiles.length === 0) {
        // No tiles played, center on logical (0,0).
        // Calculate zoom as if one tile is at (0,0) with its 1-hex border.
        targetOffsetX = gameCanvas.width / 2;
        targetOffsetY = gameCanvas.height / 2;
        // targetZoomLevel = 0.8; // Removed: Zoom will be calculated based on the 7 hexes.

        // For an empty board, calculate zoom as if one tile is at (0,0) with its 1-hex border.
        // This means coordsForBoundingBox should contain (0,0) and its 6 direct neighbors.
        coordsForBoundingBox.add("0,0");
        getNeighbors(0,0).forEach(neighbor => {
            coordsForBoundingBox.add(`${neighbor.nx},${neighbor.ny}`);
        });
        // The loop that added a second layer of neighbors is removed.

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

    // If board was initially empty, the zoom is now calculated based on a 1-tile scenario.
    // The clamping `targetZoomLevel = Math.min(targetZoomLevel, 0.8);` is no longer needed
    // as the new calculation should be authoritative.
    // if (placedTiles.length === 0) {
    //     targetZoomLevel = Math.min(targetZoomLevel, 0.8); // Ensure initial zoom is not too large // REMOVED
    // }

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

    // If isPulsingGlobal is true, we always need to redraw for the pulsing effect,
    // even if the view itself (pan/zoom) is stable.
    // Also continue if there are active score animations.
    if (needsRedraw || isPulsingGlobal || activeScoreAnimations.length > 0) {
        redrawBoardOnCanvas(); // Redraw with new current values (this now includes pulsing logic if active)
        if (selectedTile && !isRemovingTiles) { // If a tile is selected (and not removing), placement highlights also need to be updated
            updatePlacementHighlights();
        }
        // If isRemovingTiles is true, redrawBoardOnCanvas already handles the pulsing highlight.
        // No need for updatePlacementHighlights() in that specific case for the removal pulsing itself.
        animationFrameId = requestAnimationFrame(animateView); // Continue animation
    } else {
        animationFrameId = null; // Animation finished (no view change, no pulsing, no score animations)
        // Final redraw to ensure exact target values are rendered if needed,
        // and that any highlights (placement or removal) are correctly shown or cleared.
        redrawBoardOnCanvas(); // This will draw current board state.
        if (selectedTile && !isRemovingTiles) {
            updatePlacementHighlights(); // Refresh placement highlights if a tile is still selected.
        }
        // If isRemovingTiles was true and just became false, redrawBoardOnCanvas will draw without pulse.
    }
}


    resetGameButton.addEventListener('click', () => {
        console.log("Reset game button clicked.");
        const preservedOpponentType = opponentTypeSelector ? opponentTypeSelector.value : "greedy";

        // Reset Player 1 specific states before full game re-initialization
        player1GameMode = "basic";
        player1MadeFirstMove = false;
        player2GameMode = "basic";
        player2MadeFirstMove = false;


        initializeGame(true); // Pass true to indicate a reset (this calls renderPlayerHands)

        // Restore opponent type if selector exists (it should after initializeGame)
        if (opponentTypeSelector) {
            opponentTypeSelector.value = preservedOpponentType;
        }
        opponentType = preservedOpponentType; // Update internal variable

        // Ensure Player 1's mode toggle is reset in the DOM (should be handled by renderPlayerHands)
        // but an explicit check/set here can be a safeguard.
        const p1ModeToggle = document.getElementById('player1-game-mode');
        if (p1ModeToggle) {
            p1ModeToggle.value = "basic";
            p1ModeToggle.disabled = false;
            p1ModeToggle.classList.remove('locked-toggle');
        }
        const p2ModeToggle = document.getElementById('player2-game-mode');
        if (p2ModeToggle) {
            p2ModeToggle.value = "basic";
            p2ModeToggle.disabled = false;
            p2ModeToggle.classList.remove('locked-toggle');
        }
        console.log(`Game reset. Opponent type preserved as: ${opponentType}. Player 1 and Player 2 modes reset to Basic.`);
    });

    // --- Player Hand Rendering ---
    function renderPlayerHands() {
        // Create new hand containers
        // Player 1 Hand
        const hand1Div = document.createElement('div');
        hand1Div.id = 'player1-hand';
        hand1Div.classList.add('player-hand');
        // Add Player 1 mode selector similar to Player 2's opponent selector
        hand1Div.innerHTML = `
            <div class="player1-hand-header">
                <h2>Player 1</h2>
                <div id="player1-mode-selector-container">
                    <label for="player1-game-mode">Mode:</label>
                    <select id="player1-game-mode">
                        <option value="basic">Basic</option>
                        <option value="moving">With Moving</option>
                    </select>
                </div>
            </div>
            <div class="tiles-container"></div>`;

        player1HandDisplay = hand1Div.querySelector('.tiles-container');

        // Player 2 Hand
        const hand2Div = document.createElement('div');
        hand2Div.id = 'player2-hand';
        hand2Div.classList.add('player-hand');
        // Add Player 2 mode selector and opponent type selector
        hand2Div.innerHTML = `
            <div class="player2-hand-header">
                <h2>Player 2</h2>
                <div id="player2-controls-container">
                    <div id="player2-mode-selector-container">
                        <label for="player2-game-mode">Mode:</label>
                        <select id="player2-game-mode">
                            <option value="basic">Basic</option>
                            <option value="moving">With Moving</option>
                        </select>
                    </div>
                    <div id="opponent-selector-container">
                        <label for="opponent-type">Opponent:</label>
                        <select id="opponent-type">
                            <option value="human">Human</option>
                            <option value="random">Random (CPU)</option>
                            <option value="greedy">Greedy 1 (CPU)</option>
                            <option value="greedy2">Greedy 2 (CPU)</option>
                            <option value="greedy4">Greedy 4 (CPU)</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="tiles-container"></div>`;
        player2HandDisplay = hand2Div.querySelector('.tiles-container');

        // Clear existing hands from playerHandsDisplay
        playerHandsDisplay.innerHTML = '';

        // Append new hands: current player's hand first (so it's on top visually if stacking occurs),
        // then the other player's hand.
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

        // Setup Player 1's game mode selector
        const player1ModeSelector = document.getElementById('player1-game-mode');
        if (player1ModeSelector) {
            player1ModeSelector.value = player1GameMode; // Set initial value
            player1ModeSelector.disabled = player1MadeFirstMove; // Disable if first move made
            if (player1MadeFirstMove) {
                player1ModeSelector.classList.add('locked-toggle');
            }

            player1ModeSelector.removeEventListener('change', handlePlayer1ModeChange); // Prevent multiple listeners
            player1ModeSelector.addEventListener('change', handlePlayer1ModeChange);
        }

        // Setup Player 2's game mode selector
        const player2ModeSelector = document.getElementById('player2-game-mode');
        if (player2ModeSelector) {
            player2ModeSelector.value = player2GameMode; // Set initial value
            player2ModeSelector.disabled = player2MadeFirstMove; // Disable if first move made
            if (player2MadeFirstMove) {
                player2ModeSelector.classList.add('locked-toggle');
            }
            player2ModeSelector.removeEventListener('change', handlePlayer2ModeChange); // Prevent multiple listeners
            player2ModeSelector.addEventListener('change', handlePlayer2ModeChange);
        }

        // Setup Player 2's opponent type selector
        opponentTypeSelector = document.getElementById('opponent-type');
        if (opponentTypeSelector) {
            opponentTypeSelector.value = opponentType || "greedy";
            opponentType = opponentTypeSelector.value; // Ensure internal state matches DOM on render
            opponentTypeSelector.removeEventListener('change', handleOpponentTypeChange);
            opponentTypeSelector.addEventListener('change', handleOpponentTypeChange);

            // Disable P2 mode selector if P2 is AI
            if (opponentType !== "human" && player2ModeSelector) {
                player2ModeSelector.disabled = true;
                // player2ModeSelector.classList.add('locked-toggle'); // Optionally add class
            }
        }

        // Display tiles in the hands
        if (player1HandDisplay) displayPlayerHand(1, player1Hand, player1HandDisplay);
        else console.error("Could not find .tiles-container for player 1 hand (player1HandDisplay is null after renderPlayerHands).");

        if (player2HandDisplay) displayPlayerHand(2, player2Hand, player2HandDisplay);
        else console.error("Could not find .tiles-container for player 2 hand (player2HandDisplay is null after renderPlayerHands).");

        updateHandHighlights(); // Update active/inactive states
    }

    function handlePlayer1ModeChange(event) {
        if (!player1MadeFirstMove) { // Should not be changeable if first move made, but check anyway
            player1GameMode = event.target.value;
            console.log(`Player 1 game mode changed to: ${player1GameMode}`);
            updateURLWithGameState(); // Persist change
        }
    }

    function handlePlayer2ModeChange(event) {
        if (!player2MadeFirstMove && opponentType === "human") { // Only allow change if P2 is human and hasn't moved
            player2GameMode = event.target.value;
            console.log(`Player 2 game mode changed to: ${player2GameMode}`);
            updateURLWithGameState(); // Persist change
        }
    }

    function handleOpponentTypeChange(event) {
        opponentType = event.target.value;
        console.log(`Opponent type changed to: ${opponentType}`);

        const player2ModeSelector = document.getElementById('player2-game-mode');
        if (player2ModeSelector) {
            if (opponentType !== "human") {
                player2ModeSelector.value = "basic"; // AI always plays basic for now
                player2GameMode = "basic";
                player2ModeSelector.disabled = true;
                // player2ModeSelector.classList.add('locked-toggle'); // Optional
            } else {
                // If switching to human, enable mode selector only if P2 hasn't made a move
                player2ModeSelector.disabled = player2MadeFirstMove;
                // if (player2MadeFirstMove) player2ModeSelector.classList.add('locked-toggle');
                // else player2ModeSelector.classList.remove('locked-toggle');
            }
        }

        // If it's Player 2's turn and a CPU opponent is selected, and not in removal phase,
        // let the AI make a move.
        const aiOpponentTypes = ['random', 'greedy', 'greedy2', 'greedy4'];
        if (currentPlayer === 2 && aiOpponentTypes.includes(opponentType) && !isRemovingTiles) {
            console.log("Player 2 (AI) is thinking... (opponent type changed)");
            if (player2HandContainer) player2HandContainer.classList.add('ai-thinking-pulse');
            initiateAiMove();
        }
        // If it's Player 2's turn, in removal phase, and a CPU opponent is selected
        else if (currentPlayer === 2 && aiOpponentTypes.includes(opponentType) && isRemovingTiles) {
            console.log("Player 2 (AI) is choosing a tile to remove... (opponent type changed)");
            if (player2HandContainer) player2HandContainer.classList.add('ai-thinking-pulse');
            initiateAiTileRemoval();
        } else if (opponentType === 'human' || currentPlayer === 1) {
            if (player2HandContainer) player2HandContainer.classList.remove('ai-thinking-pulse');
        }
        updateURLWithGameState(); // Update URL after opponent type changes
    }

    // --- Start the game ---
    initializeGame();

    // --- Canvas Resize Logic ---
    function resizeCanvas() {
        const gameCanvas = document.getElementById('game-canvas');
        const gameboardArea = document.getElementById('gameboard-area'); // Get the container
        const mainElement = document.querySelector('main'); // Get the main element

        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        if (windowHeight >= windowWidth) {
            // New logic: board full width, 50% window height, no top margin
            gameboardArea.style.width = '100vw'; // Make container full viewport width
            gameboardArea.style.marginLeft = 'calc(-1 * (100vw - 100%) / 2)'; // Adjust margin to break out of parent constraints if necessary
            gameboardArea.style.marginRight = 'calc(-1 * (100vw - 100%) / 2)';// Adjust margin to break out of parent constraints if necessary

            gameCanvas.width = windowWidth; // Set backing store size
            gameCanvas.style.width = '100%'; // Canvas takes 100% of gameboardArea

            gameCanvas.height = windowHeight * 0.5; // Set backing store size
            gameCanvas.style.height = '50vh'; // Use vh for 50% viewport height

            gameCanvas.style.margin = "0 auto"; // Remove top/bottom margin, keep auto for horizontal centering
            gameboardArea.style.marginTop = "0"; // Ensure container also has no top margin
            // gameboardArea's other margins (left/right) are handled by the calc for 100vw behavior
            if (mainElement) mainElement.style.marginTop = '0px';

        } else {
            // Original logic: respect CSS for aspect ratio and max-width
            gameboardArea.style.width = ''; // Reset container width to CSS default
            gameboardArea.style.marginLeft = ''; // Reset container margin
            gameboardArea.style.marginRight = ''; // Reset container margin
            if (mainElement) mainElement.style.marginTop = '20px'; // Restore default top margin
            // Reset styles to let CSS handle it, or apply specific fixed sizes if that was the old way.
            // The CSS has max-width: 100% and height: auto.
            // We also need to restore the canvas's internal width/height attributes
            // to something sensible if they were changed, or let updateViewParameters handle it.
            // Let's set a default size and let updateViewParameters adjust the view.
            // The original canvas HTML is <canvas id="game-canvas" width="600" height="500"></canvas>
            gameCanvas.width = 600; // Default backing store
            gameCanvas.height = 500; // Default backing store

            gameCanvas.style.width = ''; // Reset to let CSS control (or set to gameCanvas.width + 'px')
            gameCanvas.style.height = ''; // Reset to let CSS control (or set to gameCanvas.height + 'px')

            gameCanvas.style.margin = "20px auto"; // Restore original margin from CSS
            gameboardArea.style.marginTop = ""; // Reset container margin
        }

        // After resizing the canvas, view parameters need to be updated.
        updateViewParameters();
        // And the view needs to be animated/redrawn to reflect these changes.
        // Set current to target immediately for resize, then animateView will draw.
        currentOffsetX = targetOffsetX;
        currentOffsetY = targetOffsetY;
        currentZoomLevel = targetZoomLevel;
        animateView(); // This will redraw the board based on new canvas size and view params
    }

    // Call resizeCanvas on load and on window resize
    window.addEventListener('resize', resizeCanvas);
    // Call it once initially after game setup might also be good,
    // or ensure initializeGame's call to updateViewParameters is sufficient.
    // Let's add it at the end of initializeGame.

    // --- Toast Notification Functionality ---
    let toastTimeout = null; // To manage the timeout for hiding the toast

    function showToast(message) {
        const toastElement = document.getElementById('toast-notification');
        if (!toastElement) {
            console.error("Toast notification element not found.");
            return;
        }

        toastElement.textContent = message;
        toastElement.classList.add('show');

        // Clear any existing timeout to prevent premature hiding if called multiple times
        if (toastTimeout) {
            clearTimeout(toastTimeout);
        }

        // Hide the toast after 3 seconds (or your preferred duration)
        toastTimeout = setTimeout(() => {
            toastElement.classList.remove('show');
            toastTimeout = null; // Clear the timeout ID
        }, 3000);
    }

    // --- Canvas Click Handling ---
    gameCanvas.addEventListener('click', (event) => {
        const rect = gameCanvas.getBoundingClientRect();
        // Calculate scaling factors
        const scaleX = gameCanvas.width / rect.width;
        const scaleY = gameCanvas.height / rect.height;

        // Adjust click coordinates for scaling
        const pixelX = (event.clientX - rect.left) * scaleX;
        const pixelY = (event.clientY - rect.top) * scaleY;

        const { q, r } = pixelToHexGrid(pixelX, pixelY);

        console.log(`Canvas raw click at (${event.clientX - rect.left}, ${event.clientY - rect.top}), scaled to (${pixelX.toFixed(2)}, ${pixelY.toFixed(2)}), converted to hex grid (q=${q}, r=${r})`);

        if (isRemovingTiles) {
            // --- Handle Tile Removal Click ---
            const tileKey = `${q},${r}`;
            const clickedTile = boardState[tileKey];

            if (clickedTile && currentSurroundedTilesForRemoval.some(st => st.id === clickedTile.id)) {
                // Valid tile selected for removal

                // Vibrate on mobile if API is available (MOVED HERE)
                if (navigator.maxTouchPoints > 0 && typeof navigator.vibrate === 'function') {
                    navigator.vibrate(100); // Vibrate for 100ms
                    console.log("Device vibrated on tile tap for removal."); // Updated log message
                }

                removeTileFromBoardAndReturnToHand(clickedTile);
            } else {
                console.log("Invalid selection. Click on a highlighted (surrounded) tile to remove it.");
            }
        } else {
            // --- Handle Tile Placement or Move Click ---
            const gameMode = currentPlayer === 1 ? player1GameMode : player2GameMode;

            if (!selectedTile) {
                // If no tile is selected, try to select a tile from the board if in "With Moves" mode
                if (gameMode === "moving") {
                    const tileKey = `${q},${r}`;
                    const clickedBoardTile = boardState[tileKey];
                    if (clickedBoardTile && clickedBoardTile.playerId === currentPlayer) {
                        selectTileFromBoard(clickedBoardTile, q, r); // q,r are logical board coords
                        return; // Selection made, wait for next action
                    } else if (clickedBoardTile && clickedBoardTile.playerId !== currentPlayer) {
                        console.log("Cannot select opponent's tile to move.");
                        return;
                    }
                    // If no tile at q,r or not current player's, fall through to "select from hand" message
                }
                console.log("Please select a tile from your hand or a valid tile on the board to move.");
                return;
            }

            // If a tile is already selected
            if (selectedTile.originalPlayerId !== currentPlayer) {
                console.log("Error: Tile selection does not match current player (should not happen).");
                selectedTile = null; // Clear invalid selection
                return;
            }
            handleCellClick(q, r); // This will now handle both placement and moving
        }
    });

    function selectTileFromBoard(tile, q, r) {
        console.log(`Attempting to select tile ${tile.id} from board at (${q},${r}) for moving.`);
        if (tile.playerId !== currentPlayer) {
            console.log("Cannot select opponent's tile.");
            return;
        }

        // Calculate max move distance (number of blank edges)
        const blankEdges = tile.getOrientedEdges().filter(edge => edge === 0).length;
        // The all-triangles tile (0 blank edges) cannot move.
        // The problem statement says "up to as many spots... as it has blank edges".
        // "A tile can move 0 spots (rotating in place)"
        // So even if blankEdges is 0, we should still select it to allow rotation.

        // Create a temporary canvas element for the hand representation
        const tempHandCanvas = document.createElement('canvas');
        const handTileSideLength = HAND_TILE_BASE_SIDE_LENGTH;
        const handHexWidth = 2 * handTileSideLength;
        const handHexHeight = Math.sqrt(3) * handTileSideLength;
        const canvasPadding = 5 * 2;
        tempHandCanvas.width = handHexWidth + canvasPadding;
        tempHandCanvas.height = handHexHeight + canvasPadding;
        tempHandCanvas.style.cursor = 'pointer';
        tempHandCanvas.style.margin = '2px';
        tempHandCanvas.dataset.tileId = tile.id; // Store tile ID

        // Deselect any currently selected tile (from hand or board) and remove its temporary hand representation if it exists
        if (selectedTile) {
            if (selectedTile.isBoardTile && selectedTile.handElement && selectedTile.handElement.parentNode) {
                // If previously selected tile was a board tile, remove its temp hand canvas
                selectedTile.handElement.remove();
            } else if (!selectedTile.isBoardTile && selectedTile.handElement) {
                // If it was a hand tile, redraw it without selection highlight
                const prevCtx = selectedTile.handElement.getContext('2d');
                prevCtx.clearRect(0, 0, selectedTile.handElement.width, selectedTile.handElement.height);
                const zoomForHandTile = HAND_TILE_BASE_SIDE_LENGTH / BASE_HEX_SIDE_LENGTH;
                drawHexTile(prevCtx, selectedTile.handElement.width / 2, selectedTile.handElement.height / 2, selectedTile.tile, zoomForHandTile, false, false);
            }
        }
        // Clear currentlySelectedTileCanvas if it's not the one we're about to create for the new board tile selection
        // This is mostly to ensure that if a regular hand tile was selected, its canvas is no longer considered 'currentlySelectedTileCanvas'
        // after we select a board tile.
        if (currentlySelectedTileCanvas && currentlySelectedTileCanvas !== tempHandCanvas) {
             // No redraw needed here as it should have been handled by the 'else if' above or will be overwritten.
        }


        selectedTile = {
            tile: tile, // This is the actual tile object from boardState
            handElement: tempHandCanvas, // The temporary canvas for hand display and rotation
            originalPlayerId: tile.playerId,
            isBoardTile: true,
            originalX: q,
            originalY: r,
            maxMoveDistance: blankEdges
        };
        currentlySelectedTileCanvas = tempHandCanvas; // So rotation highlights this temp canvas

        // Draw the selected board tile onto its temporary hand canvas WITH selection highlight
        const tileCtx = tempHandCanvas.getContext('2d');
        const cx = tempHandCanvas.width / 2;
        const cy = tempHandCanvas.height / 2;
        const zoomForHandTile = HAND_TILE_BASE_SIDE_LENGTH / BASE_HEX_SIDE_LENGTH;
        drawHexTile(tileCtx, cx, cy, tile, zoomForHandTile, false, true); // Draw with selection highlight

        // Visually add this temporary canvas to the player's hand display (e.g., at the beginning)
        const handDisplay = currentPlayer === 1 ? player1HandDisplay : player2HandDisplay;
        if (handDisplay.firstChild) {
            handDisplay.insertBefore(tempHandCanvas, handDisplay.firstChild);
        } else {
            handDisplay.appendChild(tempHandCanvas);
        }
        // Add click listener to this temp canvas for rotation
        tempHandCanvas.addEventListener('click', () => {
            if (selectedTile && selectedTile.isBoardTile && selectedTile.tile.id === tile.id) {
                selectedTile.tile.rotate();
                playerHasRotatedTileThisGame[currentPlayer] = true;
                console.log(`Board tile ${selectedTile.tile.id} rotated. New orientation: ${selectedTile.tile.orientation}`);
                // Redraw on temp hand canvas
                tileCtx.clearRect(0, 0, tempHandCanvas.width, tempHandCanvas.height);
                drawHexTile(tileCtx, cx, cy, selectedTile.tile, zoomForHandTile, false, true); // Redraw selected
                // updateMoveHighlights(selectedTile.tile, selectedTile.maxMoveDistance); // Update board highlights
            }
        });


        console.log(`Selected tile ${tile.id} from board. Max move: ${blankEdges} spots. Click to rotate, or click board to move.`);
        // updateMoveHighlights(tile, blankEdges); // This function needs to be created
        // updatePlacementHighlights(); // For now, this will clear placement highlights. We need updateMoveHighlights.
                                     // Or, if updateMoveHighlights doesn't exist yet, call redrawBoardOnCanvas()
                                     // and then draw the move highlights.
        // redrawBoardOnCanvas(); // Clear previous highlights
        updateMoveHighlights(tile, blankEdges); // Call the new function
        showToast("Selected tile from board. Tap hand tile to rotate, tap board to move.");
    }


    function updateMoveHighlights(tileToMove, maxDistance) {
        redrawBoardOnCanvas(); // Redraw existing tiles first

        const originalQ = tileToMove.x;
        const originalR = tileToMove.y;

        // Highlight the original spot of the tile being moved (e.g., with a different border)
        // This indicates where it's moving FROM.
        drawPlacementPreview(originalQ, originalR, tileToMove, 'rgba(128, 0, 128, 0.5)'); // Purple for origin

        const checkRadius = maxDistance + 2; // Search a bit beyond maxDistance for BFS/DFS pathfinding
        let qMin = originalQ - checkRadius, qMax = originalQ + checkRadius;
        let rMin = originalR - checkRadius, rMax = originalR + checkRadius;

        // If board is large, can optimize bounds based on existing tiles too
        if (Object.keys(boardState).length > 0) {
            let minPlacedQ = Infinity, maxPlacedQ = -Infinity, minPlacedR = Infinity, maxPlacedR = -Infinity;
            Object.values(boardState).forEach(tile => {
                if (tile.id === tileToMove.id) return; // Don't consider the tile being moved for bounds
                minPlacedQ = Math.min(minPlacedQ, tile.x);
                maxPlacedQ = Math.max(maxPlacedQ, tile.x);
                minPlacedR = Math.min(minPlacedR, tile.y);
                maxPlacedR = Math.max(maxPlacedR, tile.y);
            });
            qMin = Math.min(qMin, minPlacedQ - checkRadius / 2);
            qMax = Math.max(qMax, maxPlacedQ + checkRadius / 2);
            rMin = Math.min(rMin, minPlacedR - checkRadius / 2);
            rMax = Math.max(rMax, maxPlacedR + checkRadius / 2);
        }


        for (let q = Math.floor(qMin); q <= Math.ceil(qMax); q++) {
            for (let r = Math.floor(rMin); r <= Math.ceil(rMax); r++) {
                if (q === originalQ && r === originalR) continue; // Don't highlight the original spot as a destination if not rotating in place

                const targetKey = `${q},${r}`;
                const existingTileAtTarget = boardState[targetKey];

                if (existingTileAtTarget && existingTileAtTarget.id !== tileToMove.id) continue; // Spot occupied by another tile

                // 1. Check distance: Manhattan distance in axial coordinates
                const dist = (Math.abs(originalQ - q) + Math.abs(originalQ + originalR - q - r) + Math.abs(originalR - r)) / 2;
                if (dist > maxDistance) {
                    continue;
                }

                // Special case: 0 distance (rotation in place)
                if (dist === 0 && q === originalQ && r === originalR) {
                    // Handled by selecting the tile in hand and rotating.
                    // The spot itself should be highlighted if rotation is the only move.
                    // For now, if maxDistance is 0, we still show its original spot as a potential move.
                    // This logic might need refinement if we want to explicitly show a "rotate here" icon.
                    // The problem states: "Because a tile can move 0 spots (rotating in place)
                    // please show the selected tile as the first tile in the player's hand
                    // which is where they can tap to rotate."
                    // So, the board highlight for (q,r) where q=originalQ, r=originalR is for the *final placement*
                    // after potential rotation.
                }


                // 2. Create a temporary board state for validation
                const tempBoardState = deepCopyBoardState(boardState);
                delete tempBoardState[`${originalQ},${originalR}`]; // Remove tile from old position

                // Create a temporary tile instance for validation at the new spot with current orientation
                const tempMovedTile = new HexTile(tileToMove.id, tileToMove.playerId, [...tileToMove.edges]);
                tempMovedTile.orientation = tileToMove.orientation; // Use current orientation of the selected tile
                tempMovedTile.x = q;
                tempMovedTile.y = r;
                tempBoardState[`${q},${r}`] = tempMovedTile;


                // 3. Validate placement rules for the moved tile
                //    - Must touch an existing tile (unless it's the only tile, which shouldn't happen for a move)
                //    - Edges must match
                //    - Board must remain connected
                //    - CAN go into an empty inside spot (isSpaceEnclosed check is different)

                let touchesExistingTile = false;
                let edgesMatch = true;
                const neighbors = getNeighbors(q, r);

                if (Object.keys(tempBoardState).length === 1 && tempBoardState[`${q},${r}`] && tempBoardState[`${q},${r}`].id === tileToMove.id) {
                    // If this is the only tile on the board after the move (e.g., moving the last tile)
                    // it's valid by default in terms of touching/matching. Connectivity is also true.
                    touchesExistingTile = true; // Effectively, as it's the whole board.
                } else if (Object.keys(tempBoardState).length > 1) { // Only check neighbors if other tiles exist
                    for (const neighborInfo of neighbors) {
                        const neighborKey = `${neighborInfo.nx},${neighborInfo.ny}`;
                        const neighborTile = tempBoardState[neighborKey];

                        if (neighborTile && neighborTile.id !== tileToMove.id) { // Ensure neighbor is not the tile itself if it was just placed
                            touchesExistingTile = true;
                            const newTileOrientedEdges = tempMovedTile.getOrientedEdges();
                            const neighborOrientedEdges = neighborTile.getOrientedEdges();
                            const newTileEdgeType = newTileOrientedEdges[neighborInfo.edgeIndexOnNewTile];
                            const neighborEdgeType = neighborOrientedEdges[neighborInfo.edgeIndexOnNeighborTile];

                            if (newTileEdgeType !== neighborEdgeType) {
                                edgesMatch = false;
                                break;
                            }
                        }
                    }
                } else { // Board is empty after removing the tile, which shouldn't happen if we are moving it.
                    touchesExistingTile = true; // Should be caught by connectivity if this is an issue.
                }


                if (!touchesExistingTile && Object.keys(tempBoardState).length > 1) {
                    // If it's not touching any tile and there are other tiles, it's invalid.
                    // (Unless it's the only tile left, handled above)
                    continue;
                }
                if (!edgesMatch) {
                    continue;
                }

                // 4. Check connectivity
                if (!isBoardConnected(tempBoardState)) {
                    continue;
                }

                // 5. Moved tile can go into an empty inside spot.
                // The standard isPlacementValid has `!isSpaceEnclosed`. For moves, this is allowed.
                // So we don't call `isSpaceEnclosed` here as a condition to fail.

                // If all checks pass, highlight the spot
                // Use a different color for move highlights, e.g., blue
                drawPlacementPreview(q, r, tempMovedTile, 'blue');
            }
        }
    }


    // --- Canvas Drag and Drop Handling ---
    gameCanvas.addEventListener('dragover', (event) => {
        event.preventDefault(); // Necessary to allow dropping
        // Optionally, update highlights based on mouse position during dragover
        // This is similar to mousemove, but only if a tile is being dragged.
        if (selectedTile && !isRemovingTiles) {
            const rect = gameCanvas.getBoundingClientRect();
            const scaleX = gameCanvas.width / rect.width;
            const scaleY = gameCanvas.height / rect.height;
            const pixelX = (event.clientX - rect.left) * scaleX;
            const pixelY = (event.clientY - rect.top) * scaleY;
            const { q, r } = pixelToHexGrid(pixelX, pixelY);

            if (q !== mouseHoverQ || r !== mouseHoverR) {
                mouseHoverQ = q;
                mouseHoverR = r;
                updatePlacementHighlights(); // Show green/yellow previews

                // Draw full tile preview if hovering over a valid spot
                const tileToPlace = selectedTile.tile;
                let isSpotHighlightedGreenOrYellow = false;
                if (!boardState[`${q},${r}`]) {
                    const originalOrientation = tileToPlace.orientation;
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
                    tileToPlace.orientation = originalOrientation;
                }
                if (isSpotHighlightedGreenOrYellow) {
                    drawFullTileMouseoverPreview(q, r, tileToPlace);
                }
            }
        }
    });

    gameCanvas.addEventListener('drop', (event) => {
        event.preventDefault();
        if (isRemovingTiles) {
            console.log("Cannot drop tiles while in removal mode.");
            return;
        }
        if (!selectedTile) {
            console.log("No tile selected to drop.");
            return;
        }
        if (selectedTile.originalPlayerId !== currentPlayer) {
            console.log("Cannot drop tile: not current player's turn or tile mismatch.");
            return;
        }

        const rect = gameCanvas.getBoundingClientRect();
        const scaleX = gameCanvas.width / rect.width;
        const scaleY = gameCanvas.height / rect.height;
        const pixelX = (event.clientX - rect.left) * scaleX;
        const pixelY = (event.clientY - rect.top) * scaleY;
        const { q, r } = pixelToHexGrid(pixelX, pixelY);

        console.log(`Tile dropped at canvas (${pixelX.toFixed(2)}, ${pixelY.toFixed(2)}), grid (q=${q}, r=${r})`);

        // Use handleCellClick logic for placement, as it contains all necessary checks and actions
        handleCellClick(q, r);

        // Clear hover state after drop
        mouseHoverQ = null;
        mouseHoverR = null;
        // updatePlacementHighlights will be called by handleCellClick if successful,
        // or if not, we might want to call it to clear previews.
        // If placement in handleCellClick was unsuccessful, selectedTile is still set.
        if (selectedTile) {
            updatePlacementHighlights(); // Refresh highlights if tile wasn't placed
        } else {
            redrawBoardOnCanvas(); // If tile was placed, selectedTile is null, just redraw board.
        }
    });


    // --- Canvas MouseMove Handling for Tile Preview ---
    gameCanvas.addEventListener('mousemove', (event) => {
        if (!selectedTile || isRemovingTiles) {
            if (mouseHoverQ !== null || mouseHoverR !== null) {
                mouseHoverQ = null;
                mouseHoverR = null;
                if (selectedTile && selectedTile.isBoardTile) {
                    updateMoveHighlights(selectedTile.tile, selectedTile.maxMoveDistance);
                } else {
                    updatePlacementHighlights();
                }
            }
            return;
        }

        const rect = gameCanvas.getBoundingClientRect();
        const scaleX = gameCanvas.width / rect.width;
        const scaleY = gameCanvas.height / rect.height;
        const pixelX = (event.clientX - rect.left) * scaleX;
        const pixelY = (event.clientY - rect.top) * scaleY;
        const { q, r } = pixelToHexGrid(pixelX, pixelY);

        if (q === mouseHoverQ && r === mouseHoverR) {
            return;
        }
        mouseHoverQ = q;
        mouseHoverR = r;

        const tileToPreview = selectedTile.tile;
        let shouldShowFullPreview = false;

        if (selectedTile.isBoardTile) {
            updateMoveHighlights(tileToPreview, selectedTile.maxMoveDistance); // Redraws board and blue/purple highlights

            // Check if (q,r) is a valid move destination for full preview
            const dist = (Math.abs(selectedTile.originalX - q) + Math.abs(selectedTile.originalX + selectedTile.originalY - q - r) + Math.abs(selectedTile.originalY - r)) / 2;
            if (dist <= selectedTile.maxMoveDistance && !(q === selectedTile.originalX && r === selectedTile.originalY)) {
                const tempBoardState = deepCopyBoardState(boardState);
                delete tempBoardState[`${selectedTile.originalX},${selectedTile.originalY}`];
                const tempMovedTile = new HexTile(tileToPreview.id, tileToPreview.playerId, [...tileToPreview.edges]);
                tempMovedTile.orientation = tileToPreview.orientation;
                tempMovedTile.x = q; tempMovedTile.y = r;
                tempBoardState[`${q},${r}`] = tempMovedTile;

                let touches = (Object.keys(tempBoardState).length === 1);
                let matches = true;
                if (Object.keys(tempBoardState).length > 1) {
                    for (const neighborInfo of getNeighbors(q, r)) {
                        const neighbor = tempBoardState[`${neighborInfo.nx},${neighborInfo.ny}`];
                        if (neighbor && neighbor.id !== tempMovedTile.id) {
                            touches = true;
                            if (tempMovedTile.getOrientedEdges()[neighborInfo.edgeIndexOnNewTile] !== neighbor.getOrientedEdges()[neighborInfo.edgeIndexOnNeighborTile]) {
                                matches = false; break;
                            }
                        }
                    }
                }
                if (touches && matches && isBoardConnected(tempBoardState)) {
                    shouldShowFullPreview = true;
                }
            } else if (dist === 0 && q === selectedTile.originalX && r === selectedTile.originalY) {
                 // Allow preview on original spot if tile can be rotated there (maxMoveDistance >= 0)
                if (selectedTile.maxMoveDistance >= 0) shouldShowFullPreview = true;
            }
        } else { // Standard placement
            updatePlacementHighlights(); // Redraws board and green/yellow highlights
            if (!boardState[`${q},${r}`]) {
                const originalOrientation = tileToPreview.orientation;
                if (isPlacementValid(tileToPreview, q, r, true)) {
                    shouldShowFullPreview = true;
                } else {
                    for (let i = 0; i < 6; i++) {
                        if (i === originalOrientation) continue;
                        tileToPreview.orientation = i;
                        if (isPlacementValid(tileToPreview, q, r, true)) {
                            shouldShowFullPreview = true; break;
                        }
                    }
                }
                tileToPreview.orientation = originalOrientation;
            }
        }

        if (shouldShowFullPreview) {
            drawFullTileMouseoverPreview(q, r, tileToPreview);
        }
    });

    gameCanvas.addEventListener('mouseout', () => {
        if (mouseHoverQ !== null || mouseHoverR !== null) {
            mouseHoverQ = null;
            mouseHoverR = null;
            if (selectedTile && !isRemovingTiles) {
                if (selectedTile.isBoardTile) {
                    updateMoveHighlights(selectedTile.tile, selectedTile.maxMoveDistance);
                } else {
                    updatePlacementHighlights();
                }
            } else if (!selectedTile && !isRemovingTiles) {
                redrawBoardOnCanvas();
            }
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


    // --- Game State Persistence ---
    function serializeGameStateToString() {
        const gameState = {
            boardState: {}, // Will be populated with serializable tile data
            player1Hand: player1Hand.map(tile => ({ id: tile.id, playerId: tile.playerId, edges: tile.edges, orientation: tile.orientation })),
            player2Hand: player2Hand.map(tile => ({ id: tile.id, playerId: tile.playerId, edges: tile.edges, orientation: tile.orientation })),
            currentPlayer: currentPlayer,
            player1Score: player1Score,
            player2Score: player2Score,
            opponentType: opponentType,
            player1GameMode: player1GameMode, // Persist Player 1's game mode
            player1MadeFirstMove: player1MadeFirstMove, // Persist Player 1's first move status
            player2GameMode: player2GameMode, // Persist Player 2's game mode
            player2MadeFirstMove: player2MadeFirstMove, // Persist Player 2's first move status
            isRemovingTiles: isRemovingTiles,
            currentSurroundedTilesForRemoval: currentSurroundedTilesForRemoval.map(tile => ({ id: tile.id, playerId: tile.playerId, edges: tile.edges, orientation: tile.orientation, x: tile.x, y: tile.y })),
            lastPlacedTileKey: lastPlacedTileKey,
            // Optional: Persist view state
            // currentOffsetX: currentOffsetX,
            // currentOffsetY: currentOffsetY,
            // currentZoomLevel: currentZoomLevel,
        };

        // Serialize boardState: HexTile objects need to be converted to plain objects
        for (const key in boardState) {
            const tile = boardState[key];
            gameState.boardState[key] = {
                id: tile.id,
                playerId: tile.playerId,
                edges: tile.edges,
                orientation: tile.orientation,
                x: tile.x,
                y: tile.y,
            };
        }
        return JSON.stringify(gameState);
    }

    function updateURLWithGameState() {
        const serializedState = serializeGameStateToString();
        const newUrl = `${window.location.pathname}?gameState=${encodeURIComponent(serializedState)}`;
        history.pushState({ gameState: serializedState }, "", newUrl);
        // console.log("Game state updated in URL."); // Optional: for debugging
    }

    function deserializeGameStateFromString(stateString) {
        try {
            const savedState = JSON.parse(stateString);
            if (!savedState) return null;

            // Helper to reconstruct HexTile instances
            const rehydrateTile = (tileData) => {
                if (!tileData) return null;
                const tile = new HexTile(tileData.id, tileData.playerId, [...tileData.edges]);
                tile.orientation = tileData.orientation || 0;
                tile.x = tileData.x !== undefined ? tileData.x : null;
                tile.y = tileData.y !== undefined ? tileData.y : null;
                return tile;
            };

            const gameState = {
                boardState: {},
                player1Hand: savedState.player1Hand ? savedState.player1Hand.map(rehydrateTile) : [],
                player2Hand: savedState.player2Hand ? savedState.player2Hand.map(rehydrateTile) : [],
                currentPlayer: savedState.currentPlayer || 1,
                player1Score: savedState.player1Score || 0,
                player2Score: savedState.player2Score || 0,
                opponentType: savedState.opponentType || "greedy",
                player1GameMode: savedState.player1GameMode || "basic", // Restore P1 game mode
                player1MadeFirstMove: savedState.player1MadeFirstMove || false, // Restore P1 first move status
                player2GameMode: savedState.player2GameMode || "basic", // Restore P2 game mode
                player2MadeFirstMove: savedState.player2MadeFirstMove || false, // Restore P2 first move status
                isRemovingTiles: savedState.isRemovingTiles || false,
                currentSurroundedTilesForRemoval: savedState.currentSurroundedTilesForRemoval ? savedState.currentSurroundedTilesForRemoval.map(rehydrateTile) : [],
                lastPlacedTileKey: savedState.lastPlacedTileKey || null,
                // Optional: Restore view state if it was saved
                // currentOffsetX: savedState.currentOffsetX,
                // currentOffsetY: savedState.currentOffsetY,
                // currentZoomLevel: savedState.currentZoomLevel,
            };

            if (savedState.boardState) {
                for (const key in savedState.boardState) {
                    gameState.boardState[key] = rehydrateTile(savedState.boardState[key]);
                }
            }
            return gameState;

        } catch (error) {
            console.error("Error deserializing game state:", error);
            return null; // Return null or default state if parsing fails
        }
    }

});
