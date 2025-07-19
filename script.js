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

// --- Cookie Helper Functions ---
function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "")  + expires + "; path=/; SameSite=Lax";
    // console.log(`Cookie set: ${name}=${value}`); // Optional: for debugging
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) {
            const value = c.substring(nameEQ.length, c.length);
            // console.log(`Cookie found: ${name}=${value}`); // Optional: for debugging
            return value;
        }
    }
    // console.log(`Cookie not found: ${name}`); // Optional: for debugging
    return null;
}


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
    let player1GameMode = "basic"; // Player 1's game mode (this is now the game-wide mode)
    let player1MadeFirstMove = false; // Tracks if Player 1 has made their first move
    let player2MadeFirstMove = false; // Tracks if Player 2 has made their first move (still relevant for UI, e.g. disabling opponent type selector if P2 human moved)
    let mouseHoverQ = null;
    let mouseHoverR = null;
    let lastPlacedTileKey = null; // Stores the key (e.g., "x,y") of the most recently placed tile
    let aiEvaluatingDetails = null; // Stores details of the tile AI is currently evaluating
    let lastMovedTileOriginalPosition = null; // Stores {q, r, playerId} of the last moved tile's origin

    // Cache for getOutsideEmptyCells
    let cachedOutsideEmptyCells = null;
    let boardStateSignatureForCache = "";

    function invalidateOutsideCellCache() {
        cachedOutsideEmptyCells = null;
        boardStateSignatureForCache = "";
        // console.log("Outside cell cache invalidated.");
    }

    // Long press detection variables
    let longPressTimer = null;
    let pressStartTime = 0;
    let pressStartCoords = null; // { x: pixelX, y: pixelY } on canvas
    const LONG_PRESS_DURATION = 500; // milliseconds
    let longPressJustHappened = false; // Flag to prevent click after long press

    // Pulsing animation variables for removal highlight
    let pulseStartTime = 0;
    const PULSE_DURATION = 1000; // milliseconds for one full pulse cycle
    let isPulsingGlobal = false; // To keep animateView running for pulsing
    let currentlyHighlightedTriangles = []; // For score animation highlights
    let activeScoreAnimations = []; // For "+1" animations on the board

    // State variables for toast notification logic
    let isFirstTurn = true; // This seems to track if ANY player has made the first move of the game.
    let playerHasRotatedTileThisGame = {1: false, 2: false};


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
            invalidateOutsideCellCache();
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
            const isCurrentlyBoardSelected = selectedTile && selectedTile.isBoardTile && selectedTile.tile.id === tile.id;

            // Pass isCurrentlyBoardSelected to drawHexTile
            drawHexTile(ctx, screenX, screenY, tile, currentZoomLevel, false, false, isLastPlaced, isCurrentlyBoardSelected);

            // Highlight if in removal mode and tile is one of the surrounded ones
            // This should not conflict with isBoardSelected, as isRemovingTiles implies a different game phase.
            // If isBoardSelected and isRemovingTiles could be true simultaneously for the same tile,
            // drawHexTile might need logic to prioritize or combine highlights. For now, assume distinct phases.
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

    // --- Draw Shaded Spot for Moved Tile ---
    if (player1GameMode === "moving" && lastMovedTileOriginalPosition &&
        lastMovedTileOriginalPosition.playerId !== currentPlayer && !selectedTile) {
        // Draw shade if:
        // 1. Game is in "moving" mode.
        // 2. A tile was moved (lastMovedTileOriginalPosition is set).
        // 3. It's the *next* player's turn (current player is not the one who moved the tile).
        // 4. The next player has *not yet* selected a tile for their current turn (!selectedTile).
        const { q, r } = lastMovedTileOriginalPosition;
        const shadeScreenX = currentOffsetX + scaledHexSideLength * (3/2 * q);
        const shadeScreenY = currentOffsetY + scaledHexSideLength * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 180 * (60 * i);
            const vx = shadeScreenX + scaledHexSideLength * Math.cos(angle);
            const vy = shadeScreenY + scaledHexSideLength * Math.sin(angle);
            if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(100, 100, 100, 0.35)'; // Semi-transparent gray
        ctx.fill();
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



    function getPlayerColorValue(className) {
        const style = getComputedStyle(document.documentElement);
        return style.getPropertyValue(`--${className}`).trim();
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


    // --- Game Board Logic ---
    function initializeGameBoard() {
        // Clear the canvas
        ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
        // Optionally, draw a background or grid lines on the canvas here
        // For example, a simple background:
        ctx.fillStyle = 'lightblue'; // Same as old #game-board background
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
    // isBoardSelected: if true, draws a distinct highlight for a tile selected directly on the board.
    function drawHexTile(ctx, cx, cy, tile, zoom = 1.0, transparentBackground = false, isSelected = false, isRaisedEffect = false, isBoardSelected = false) {
        const orientedEdges = tile.getOrientedEdges();
        const sideLength = BASE_HEX_SIDE_LENGTH * zoom;

        // Helper function to draw a rounded triangle
        function drawRoundedTriangle(tipX, tipY, base1X, base1Y, base2X, base2Y, cornerRadius) {
            // Adjusted vectors towards base vertices to accommodate the radius
            const vecTipToBase1X = base1X - tipX;
            const vecTipToBase1Y = base1Y - tipY;
            const lenTipToBase1 = Math.sqrt(vecTipToBase1X * vecTipToBase1X + vecTipToBase1Y * vecTipToBase1Y);
            const unitTipToBase1X = vecTipToBase1X / lenTipToBase1;
            const unitTipToBase1Y = vecTipToBase1Y / lenTipToBase1;

            const vecTipToBase2X = base2X - tipX;
            const vecTipToBase2Y = base2Y - tipY;
            const lenTipToBase2 = Math.sqrt(vecTipToBase2X * vecTipToBase2X + vecTipToBase2Y * vecTipToBase2Y);
            const unitTipToBase2X = vecTipToBase2X / lenTipToBase2;
            const unitTipToBase2Y = vecTipToBase2Y / lenTipToBase2;

            const p1x = tipX + unitTipToBase1X * cornerRadius;
            const p1y = tipY + unitTipToBase1Y * cornerRadius;
            const p2x = tipX + unitTipToBase2X * cornerRadius;
            const p2y = tipY + unitTipToBase2Y * cornerRadius;

            ctx.beginPath();
            ctx.moveTo(p1x, p1y);
            ctx.arcTo(tipX, tipY, p2x, p2y, cornerRadius);
            ctx.lineTo(p2x, p2y); // Line to the point where the arc ends
            ctx.lineTo(base2X, base2Y);
            ctx.lineTo(base1X, base1Y);
            ctx.closePath();
        }

        let originalShadowColor, originalShadowBlur, originalShadowOffsetX, originalShadowOffsetY;
        let raisedEffectApplied = false;

        // isBoardSelected highlight should take precedence over isRaisedEffect if both could apply.
        // isSelected is for hand tiles, isBoardSelected for board tiles. They shouldn't both be true.
        if (isRaisedEffect && !isSelected && !isBoardSelected) {
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
            ctx.fillStyle = getPlayerColorValue(tile.getPlayerColor);
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

                const cornerRadius = triangleEdgeLength * 0.10;

                drawRoundedTriangle(tipX, tipY, base1X, base1Y, base2X, base2Y, cornerRadius);
                ctx.fillStyle = getPlayerColorValue(tile.getPlayerColor);
                ctx.fill();

                // Check if this specific triangle edge should be highlighted for pulsing shadow
                const highlightInfo = currentlyHighlightedTriangles.find(ht => {
                    return ht.x === tile.x && ht.y === tile.y && ht.edgeIndex === i;
                });

                if (highlightInfo && highlightInfo.pulseIntensity > 0) {
                    ctx.save();
                    ctx.shadowColor = getPlayerColorValue(tile.getPlayerColor); // Shadow color same as triangle
                    ctx.shadowBlur = highlightInfo.pulseIntensity * 10 * zoom; // Intensity controls blur
                    ctx.shadowOffsetX = 0; // No offset for a glow effect
                    ctx.shadowOffsetY = 0;

                    // Redraw the triangle path to apply the shadow.
                    ctx.fillStyle = getPlayerColorValue(tile.getPlayerColor); // Fill must be opaque to cast shadow
                    drawRoundedTriangle(tipX, tipY, base1X, base1Y, base2X, base2Y, cornerRadius);
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

        // Draw board selection highlight if isBoardSelected is true
        if (isBoardSelected) {
            ctx.shadowColor = 'cyan';
            ctx.shadowBlur = 8 * zoom;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.strokeStyle = '#00FFFF'; // Cyan stroke color for the highlight itself
            ctx.lineWidth = 2 * zoom;   // A slightly thicker line for the board selection

            ctx.beginPath();
            ctx.moveTo(vertices[0].x, vertices[0].y);
            for (let i = 1; i < 6; i++) {
                ctx.lineTo(vertices[i].x, vertices[i].y);
            }
            ctx.closePath();
            ctx.stroke(); // This stroke casts the shadow and provides the line

            // Reset shadow properties
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
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
            p1ScoreDisplayFloater.className = 'player1-color'; // Player 1 color

            p2ScoreDisplayFloater.textContent = player2Score;
            p2ScoreDisplayFloater.className = 'player2-color'; // Player 2 color
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
        invalidateOutsideCellCache(); // Invalidate at the beginning of any initialization/reset
        console.log(`Attempting to initialize game... Reset flag: ${isReset}`);
        let loadedState = null;
        const urlParams = new URLSearchParams(window.location.search);
        const gameStateParam = urlParams.get('gameState');

        // Initialize game settings variables with hardcoded defaults first
        let currentWorkingGameMode = "basic";
        let currentWorkingOpponentType = "greedy";

        // Try to load from cookies to override hardcoded defaults
        const preferredModeFromCookie = getCookie('preferredGameMode');
        if (preferredModeFromCookie) {
            currentWorkingGameMode = preferredModeFromCookie;
            console.log(`Loaded preferred game mode from cookie: ${currentWorkingGameMode}`);
        }
        const preferredOpponentFromCookie = getCookie('preferredOpponentType');
        if (preferredOpponentFromCookie) {
            currentWorkingOpponentType = preferredOpponentFromCookie;
            console.log(`Loaded preferred opponent type from cookie: ${currentWorkingOpponentType}`);
        }

        // Assign to global game variables after potential cookie load
        player1GameMode = currentWorkingGameMode;
        opponentType = currentWorkingOpponentType;

        // Now, try to load from URL parameters if not a reset
        if (!isReset && gameStateParam) {
            console.log("Found gameState parameter in URL. Attempting to load.");
            loadedState = deserializeGameStateFromString(decodeURIComponent(gameStateParam));
            if (loadedState) {
                console.log("Successfully deserialized game state from URL. URL settings will override cookie/defaults.");
                // Apply the loaded state
                boardState = loadedState.boardState;
                player1Hand = loadedState.player1Hand;
                player2Hand = loadedState.player2Hand;
                currentPlayer = loadedState.currentPlayer;
                player1Score = loadedState.player1Score;
                player2Score = loadedState.player2Score;
                // IMPORTANT: URL parameters override cookie/default settings
                player1GameMode = loadedState.player1GameMode || player1GameMode; // Use loaded if present, else keep current (from cookie/default)
                opponentType = loadedState.opponentType || opponentType;          // Use loaded if present, else keep current
                player1MadeFirstMove = loadedState.player1MadeFirstMove || false;
                player2MadeFirstMove = loadedState.player2MadeFirstMove || false;
                // player2GameMode is no longer used
                isRemovingTiles = loadedState.isRemovingTiles;
                currentSurroundedTilesForRemoval = loadedState.currentSurroundedTilesForRemoval;
                lastPlacedTileKey = loadedState.lastPlacedTileKey;
                selectedTile = null;
                aiEvaluatingDetails = null;
                console.log(`Game state loaded from URL. Mode: ${player1GameMode}, Opponent: ${opponentType}`);
            } else {
                console.warn("Failed to deserialize game state from URL. Using cookie-derived or hardcoded defaults.");
                // player1GameMode and opponentType remain as set from cookies or hardcoded defaults
            }
        } else if (isReset) {
            console.log("Resetting game: Using cookie-derived or hardcoded defaults for mode/opponent.");
            // player1GameMode and opponentType are already set (from cookie or hardcoded default)
        }


        if (!loadedState || isReset) {
            console.log("Initializing a new game setup (hands, scores etc.). Mode and Opponent Type are now finalized for this game instance.");
            // This block resets game elements like hands, scores, board.
            // player1GameMode and opponentType have their definitive values for this game instance by now.

            player1Hand = generateUniqueTilesForPlayer(1, NUM_TILES_PER_PLAYER);
            // player1Hand = generateUniqueTilesForPlayer(1, NUM_TILES_PER_PLAYER); // Duplicate line removed
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

            player1MadeFirstMove = false; // Always reset these for a new game or reset
            player2MadeFirstMove = false;

            // If this is a truly new game (not from URL) or a reset,
            // the current player1GameMode and opponentType (derived from cookies or defaults)
            // should be saved back to cookies, as they represent the settings for *this new game*.
            if (!gameStateParam || isReset) { // Check !gameStateParam to ensure we are not in a shared game link scenario
                console.log(`Saving current settings to cookie for future new games: Mode=${player1GameMode}, Opponent=${opponentType}`);
                setCookie('preferredGameMode', player1GameMode, 30);
                setCookie('preferredOpponentType', opponentType, 30);
            }

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
        if (!selectedTile) {
            redrawBoardOnCanvas();
            return;
        }

        redrawBoardOnCanvas(); // Redraw existing tiles first

        const tileToPlace = selectedTile.tile;
        const placements = getAllPossiblePlacements(boardState, tileToPlace, currentPlayer);
        const currentSelectedOrientation = tileToPlace.orientation;

        const greenSpots = new Set();
        const yellowSpots = new Map();

        const uniqueOrientations = getUniqueOrientations(tileToPlace);
        const numUniqueOrientations = uniqueOrientations.length;

        for (const placement of placements) {
            const key = `${placement.x},${placement.y}`;
            if ((currentSelectedOrientation % numUniqueOrientations) === (placement.orientation % numUniqueOrientations)) {
                greenSpots.add(key);
            } else {
                if (!yellowSpots.has(key)) {
                    yellowSpots.set(key, placement.orientation);
                }
            }
        }

        for (const key of greenSpots) {
            const [q, r] = key.split(',').map(Number);
            drawPlacementPreview(q, r, tileToPlace, 'green');
        }

        for (const [key, orientation] of yellowSpots.entries()) {
            if (!greenSpots.has(key)) {
                const [q, r] = key.split(',').map(Number);
                const tempTileForYellowPreview = new HexTile(tileToPlace.id, tileToPlace.playerId, [...tileToPlace.edges]);
                tempTileForYellowPreview.orientation = orientation;
                drawPlacementPreview(q, r, tempTileForYellowPreview, 'yellow');
            }
        }
    }

    function selectTileFromHand(tile, tileCanvasElement, playerId, isDragStart = false) {
        if (playerId !== currentPlayer) {
            console.log("It's not your turn!");
            return;
        }

        // Clear moved tile shadow if the current player is selecting a tile and they were not the one who moved.
        if (lastMovedTileOriginalPosition && lastMovedTileOriginalPosition.playerId !== currentPlayer) {
            lastMovedTileOriginalPosition = null;
            console.log("Cleared moved tile shadow because next player selected a tile from hand.");
            // No need to redraw here, as subsequent actions (updatePlacementHighlights) will trigger redraw.
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
            drawHexTile(tileCtx, tileCanvasElement.width / 2, tileCanvasElement.height / 2, selectedTile.tile, zoomForHandTile, false, true); // Redraw with highlight
            updatePlacementHighlights(); // Update board previews immediately
        } else {
            // New selection or switching from a different tile (hand or board)
            if (selectedTile) { // If something was selected before (could be a board tile or another hand tile)
                clearSelectionAndHighlights(false); // Clear previous selection, but don't full redraw board yet
                                                // as updatePlacementHighlights below will do it.
            }

            // Redraw the newly selected hand tile with highlight (current tileCanvasElement)
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
        // Initial checks for selectedTile and player mismatch are now primarily handled by the main canvas click listener before calling this.
        // However, keeping them here as safeguards is fine, but they should return boolean.
        if (!selectedTile) {
            console.log("handleCellClick: No tile selected.");
            return false;
        }
        if (selectedTile.originalPlayerId !== currentPlayer) {
            console.error("handleCellClick: Error: Selected tile's player ID does not match current player.");
            return false;
        }

        if (selectedTile.isBoardTile) {
            // --- Attempt to MOVE the selected board tile ---
            const tileMovedSuccessfully = moveTileOnBoard(selectedTile.tile, x, y, selectedTile.originalX, selectedTile.originalY, selectedTile.maxMoveDistance);

            // selectedTile.handElement is null for board tiles due to prior changes in selectTileFromBoard,
            // so no specific handElement removal is needed here for board tiles.

            if (tileMovedSuccessfully) {
                // moveTileOnBoard now handles nullifying selectedTile, redrawing, and calling processSuccessfulPlacement.
                return true;
            } else {
                // moveTileOnBoard calls updateMoveHighlights and showToast on failure.
                // selectedTile remains selected if moveTileOnBoard returns false.
                // The main click handler will use this 'false' to deselect the tile.
                return false;
            }
        } else {
            // --- Attempt to PLACE a NEW tile from hand ---
            const tileToPlace = selectedTile.tile;
            const handElementToRemove = selectedTile.handElement;

            if (placeTileOnBoard(tileToPlace, x, y)) {
                // Remove tile from hand's data model
                if (currentPlayer === 1) {
                    player1Hand = player1Hand.filter(t => t.id !== tileToPlace.id);
                } else {
                    player2Hand = player2Hand.filter(t => t.id !== tileToPlace.id);
                }
                // Remove tile from hand's display
                if (handElementToRemove && handElementToRemove.parentNode) {
                    handElementToRemove.remove();
                }

                const lastPlacedKey = lastPlacedTileKey;
                const playerOfTurn = currentPlayer;

                selectedTile = null;
                currentlySelectedTileCanvas = null;

                // Update player hand display
                if (playerOfTurn === 1) {
                    displayPlayerHand(1, player1Hand, player1HandDisplay);
                } else {
                    displayPlayerHand(2, player2Hand, player2HandDisplay);
                }
                // updatePlacementHighlights(); // Not needed here, processSuccessfulPlacement and subsequent redraws handle it.
                processSuccessfulPlacement(lastPlacedKey, playerOfTurn, null, null, false); // false indicates it was a new placement, not a move
                return true;
            } else {
                // Invalid placement. isPlacementValid (called by placeTileOnBoard) logs details.
                // selectedTile remains selected. The main click handler will use this 'false' to deselect.
                return false;
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
        invalidateOutsideCellCache(); // Board state changed
        lastPlacedTileKey = targetKey;       // Treat moved tile as "last placed" for scoring, etc.
        lastMovedTileOriginalPosition = { q: oldX, r: oldY, playerId: tileToMove.playerId }; // Store original position and player

        console.log(`Tile ${tileToMove.id} successfully moved to (${newX},${newY}). Orientation: ${tileToMove.orientation}. Original spot stored for shading.`);
        redrawBoardOnCanvas();

    // Defer subsequent processing to allow repaint and make the move feel more immediate
    setTimeout(() => {
        processSuccessfulPlacement(lastPlacedTileKey, currentPlayer, oldX, oldY, true); // Pass old coords and true for wasMove
    }, 0);

        return true;
    }

    // New function to process successful placement and subsequent actions
function processSuccessfulPlacement(placedTileKey, playerOfTurn, oldX = null, oldY = null, wasMove = false) {
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

                    checkForSurroundedTilesAndProceed(placedTileKey, oldX, oldY, wasMove);
                    updateViewParameters();
                    animateView();
                });
            });
        }, 1000); // Delay matches PULSE_ANIMATION_DURATION in highlightMatchedTriangles

    } else {
        // No score change from this placement
        checkForSurroundedTilesAndProceed(placedTileKey, oldX, oldY, wasMove);
        updateViewParameters();
        animateView();
    }
    updateURLWithGameState(); // Update URL after a tile placement is fully processed
}


    function placeTileOnBoard(tile, x, y) {
        // When placing a new tile from hand, isNewTilePlacement is true. isDragOver is false.
        if (!window.isPlacementValid(tile, x, y, boardState, false, true)) {
            return false;
        }

        tile.x = x;
        tile.y = y;
        boardState[`${x},${y}`] = tile;
        lastPlacedTileKey = `${x},${y}`; // Update the last placed tile key
        lastMovedTileOriginalPosition = null; // Clear moved tile shadow when a new tile is placed
        invalidateOutsideCellCache();

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
            // Player 2 mode toggle is removed, so no need to lock it.
            // console.log("Player 2 has made their first move. Opponent type selector might be locked if it's human P2.");
            // The opponentTypeSelector locking is handled by its own 'disabled' state if P2 is human and has moved.
            // This 'player2MadeFirstMove' flag is still useful for that.
        }

        redrawBoardOnCanvas(); // Redraw the entire board with the new tile

        // const cell = getBoardCell(x,y); // Obsolete
        // if (cell) { ... } // Obsolete
        return true;
    }

    // --- Game Logic: Validation, Turns, End, Scoring ---
        // This function will be called from processSuccessfulPlacement after a tile is placed or moved.
        // It now receives information about the placed/moved tile to optimize surround checks.
        function checkForSurroundedTilesAndProceed(placedTileKey, oldX, oldY, wasMove) {
            let surroundedTiles;
            const placedTile = boardState[placedTileKey];

            if (placedTile) { // Ensure the placed tile exists
                const candidateTilesToCheck = getPotentiallyAffectedTilesForSurroundCheck(boardState, placedTile, oldX, oldY, wasMove);
                surroundedTiles = getNewlySurroundedTiles(boardState, candidateTilesToCheck);
                console.log(`Optimized surround check: ${candidateTilesToCheck.length} candidates, found ${surroundedTiles.length} surrounded.`);
            } else {
                console.warn("checkForSurroundedTilesAndProceed: placedTile not found at key", placedTileKey, "Falling back to full scan.");
                surroundedTiles = getSurroundedTiles(boardState); // Fallback to full scan if something is wrong
            }

            if (surroundedTiles.length > 0) {
                processTileRemoval(surroundedTiles);
            } else {
                isRemovingTiles = false;
                isPulsingGlobal = false;
                calculateAndUpdateTotalScores();
                switchTurn();
            }
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
            gameMode: player1GameMode, // Pass the unified game mode (set by Player 1)
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
        console.log("[Main] Received AI move result from worker:", JSON.stringify(move)); // Log the full move object
        if (player2HandContainer) player2HandContainer.classList.remove('ai-thinking-pulse');

        if (move && typeof move.tileId !== 'undefined' && typeof move.orientation !== 'undefined' && typeof move.x !== 'undefined' && typeof move.y !== 'undefined' && move.type) {
            if (move.type === 'place') {
                const tileToPlace = player2Hand.find(t => t.id === move.tileId);
                if (!tileToPlace) {
                    console.error(`[Main] AI Error (place): Best move tile (ID: ${move.tileId}) not found in player 2 hand.`);
                    switchTurn(); return;
                }
                tileToPlace.orientation = move.orientation;
                console.log(`[Main] AI (${opponentType}) attempting to PLACE tile ${tileToPlace.id} (ori: ${tileToPlace.orientation}) at (${move.x}, ${move.y})`);
                if (placeTileOnBoard(tileToPlace, move.x, move.y)) {
                    player2Hand = player2Hand.filter(t => t.id !== tileToPlace.id);
                    displayPlayerHand(2, player2Hand, player2HandDisplay);
                    console.log(`[Main] AI (${opponentType}) successfully PLACED tile ${tileToPlace.id}.`);
                    processSuccessfulPlacement(lastPlacedTileKey, 2);
                } else {
                    console.error(`[Main] AI (${opponentType}) failed to PLACE tile ${tileToPlace.id} (ori: ${tileToPlace.orientation}) at (${move.x}, ${move.y}). Worker validation should catch this.`);
                    switchTurn();
                }
            } else if (move.type === 'move') {
                const tileToMove = boardState[`${move.originalX},${move.originalY}`];
                if (!tileToMove || tileToMove.id !== move.tileId || tileToMove.playerId !== currentPlayer) {
                     console.error(`[Main] AI Error (move): Tile to move (ID: ${move.tileId}) not found at original position (${move.originalX},${move.originalY}) or player mismatch.`);
                     switchTurn(); return;
                }
                // The AI worker decided the orientation, so we set it on the tile object from the board.
                tileToMove.orientation = move.orientation;

                console.log(`[Main] AI (${opponentType}) attempting to MOVE tile ${tileToMove.id} from (${move.originalX},${move.originalY}) to (${move.x},${move.y}) (new ori: ${move.orientation})`);

                // Use a simplified move logic here, as AI worker should have validated it.
                // Or, call a version of moveTileOnBoard that skips some client-side checks if AI is trusted.
                // For now, let's assume the AI's chosen move is valid and directly apply it.
                // This bypasses the UI-driven moveTileOnBoard which has its own selection logic.

                delete boardState[`${move.originalX},${move.originalY}`];
                tileToMove.x = move.x;
                tileToMove.y = move.y;
                // tileToMove.orientation is already set from AI's decision
                boardState[`${move.x},${move.y}`] = tileToMove;
                lastPlacedTileKey = `${move.x},${move.y}`;
                // Set lastMovedTileOriginalPosition for AI moves
                lastMovedTileOriginalPosition = { q: move.originalX, r: move.originalY, playerId: tileToMove.playerId };

                console.log(`[Main] AI (${opponentType}) successfully MOVED tile ${tileToMove.id}. Original spot stored for shading.`);
                redrawBoardOnCanvas(); // Redraw to show the move

    // Defer subsequent processing to allow repaint and make the move feel more immediate
    setTimeout(() => {
        processSuccessfulPlacement(lastPlacedTileKey, 2, move.originalX, move.originalY, true); // Pass move details
    }, 0);

            } else {
                console.error(`[Main] AI Error: Unknown move type received: ${move.type}. Move:`, JSON.stringify(move));
    // If AI move fails unexpectedly, ensure turn switches to prevent game stall
    // Consider if any cleanup or state reset is needed here before switching.
    // For now, just switch turn.
                switchTurn();
            }
        } else {
            console.log(`[Main] AI (${opponentType}) could not find a valid move, passed, or move object was malformed. Passing turn. Move received:`, JSON.stringify(move));
            calculateAndUpdateTotalScores(); // Ensure scores are up-to-date if AI passes
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
        // Determine current player's hand. The game mode is now unified by player1GameMode.
        const currentPlayersHand = currentPlayer === 1 ? player1Hand : player2Hand;
        const gameMode = player1GameMode; // Unified game mode

        if (currentPlayersHand.length === 0) {
            if (gameMode === "moving") {
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
        scoreDisplayElement.style.color = ''; // Reset inline color
        scoreDisplayElement.className = playerId === 1 ? 'player1-color' : 'player2-color'; // Reset to player color

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
        // If isRemovingTiles is true, redrawBoardOnCanvas already handles the pulsing highlight.
        // No need for updatePlacementHighlights() in that specific case for the removal pulsing itself.
        animationFrameId = requestAnimationFrame(animateView); // Continue animation
    } else {
        animationFrameId = null; // Animation finished (no view change, no pulsing, no score animations)
        // Final redraw to ensure exact target values are rendered if needed,
        // and that any highlights (placement or removal) are correctly shown or cleared.
        redrawBoardOnCanvas(); // This will draw current board state.
        // If isRemovingTiles was true and just became false, redrawBoardOnCanvas will draw without pulse.
    }
}


    resetGameButton.addEventListener('click', () => {
        console.log("Reset game button clicked.");
        const preservedOpponentType = opponentTypeSelector ? opponentTypeSelector.value : "greedy";

        // Reset Player 1 specific states before full game re-initialization
        player1MadeFirstMove = false;
    // player1GameMode will be handled by initializeGame based on cookies/defaults
        player2MadeFirstMove = false;
    // player2GameMode has been removed.


        initializeGame(true); // Pass true to indicate a reset (this calls renderPlayerHands)

        // Restore opponent type if selector exists (it should after initializeGame)
        if (opponentTypeSelector) {
            opponentTypeSelector.value = preservedOpponentType;
        }
        opponentType = preservedOpponentType; // Update internal variable

        // Ensure Player 1's mode toggle is reset in the DOM.
        // initializeGame() -> renderPlayerHands() already sets the value based on player1GameMode (cookie or default)
        // and handles the disabled state based on player1MadeFirstMove (which is false here).
        const p1ModeToggle = document.getElementById('player1-game-mode');
        if (p1ModeToggle) {
            // Value is set correctly by renderPlayerHands.
            // We just ensure it's enabled and not locked.
            p1ModeToggle.disabled = false;
            p1ModeToggle.classList.remove('locked-toggle');
        }
        // const p2ModeToggle = document.getElementById('player2-game-mode'); // Removed
        // if (p2ModeToggle) { // Removed
        //     p2ModeToggle.value = "basic"; // Removed
        //     p2ModeToggle.disabled = false; // Removed
        //     p2ModeToggle.classList.remove('locked-toggle'); // Removed
        // } // Removed
        console.log(`Game reset. Opponent type preserved as: ${opponentType}. Player 1 game mode reset (based on cookie or default).`);
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
        // Add Player 2 opponent type selector (mode selector removed)
        hand2Div.innerHTML = `
            <div class="player2-hand-header">
                <h2>Player 2</h2>
                <div id="player2-controls-container">
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

        // Player 2's game mode selector has been removed. Player 2's mode is determined by Player 1.

        // Setup Player 2's opponent type selector
        opponentTypeSelector = document.getElementById('opponent-type');
        if (opponentTypeSelector) {
            opponentTypeSelector.value = opponentType || "greedy";
            opponentType = opponentTypeSelector.value; // Ensure internal state matches DOM on render
            opponentTypeSelector.removeEventListener('change', handleOpponentTypeChange);
            opponentTypeSelector.addEventListener('change', handleOpponentTypeChange);

            // Player 2's mode selector is no longer used, so the logic to disable it
            // if the opponent is AI is also removed. Game mode is controlled by Player 1.
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
            // player2GameMode = player1GameMode; // Ensure P2 mode mirrors P1, if variable is kept
            console.log(`Game mode (set by Player 1) changed to: ${player1GameMode}`);
            setCookie('preferredGameMode', player1GameMode, 30); // Save preference
            updateURLWithGameState(); // Persist change
        }
    }

    /* // This function is no longer needed as player2GameMode is removed.
    function handlePlayer2ModeChange(event) {
        if (!player2MadeFirstMove && opponentType === "human") {
            // player2GameMode = event.target.value; // player2GameMode removed
            // console.log(`Player 2 game mode changed to: ${player2GameMode}`);
            updateURLWithGameState(); // Persist change
        }
    }
    */

    function handleOpponentTypeChange(event) {
        opponentType = event.target.value;
        console.log(`Opponent type changed to: ${opponentType}`);
        setCookie('preferredOpponentType', opponentType, 30); // Save preference

        // Player 2 mode selector no longer exists, so no need to disable it.
        // The game mode is solely determined by player1GameMode.
        // If P2 is AI, it will use player1GameMode.

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

        if (windowHeight >= 3*(windowWidth/2)) {
            // New logic: board full width, 50% window height, no top margin
            gameboardArea.style.width = '100vw'; // Make container full viewport width
            gameboardArea.style.marginLeft = 'calc(-1 * (100vw - 100%) / 2)'; // Adjust margin to break out of parent constraints if necessary
            gameboardArea.style.marginRight = 'calc(-1 * (100vw - 100%) / 2)';// Adjust margin to break out of parent constraints if necessary

            gameCanvas.width = windowWidth; // Set backing store size
            gameCanvas.style.width = '100%'; // Canvas takes 100% of gameboardArea

            // Set canvas height equal to its width for a 1:1 aspect ratio in portrait mode
            gameCanvas.height = gameCanvas.width;
            gameCanvas.style.height = gameCanvas.width + 'px';

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
            
            // Get player hand width
            const playerHandElement = document.querySelector('.player-hand');
            if (playerHandElement) {
                const playerHandWidth = playerHandElement.getBoundingClientRect().width;

                gameboardArea.style.width = `${playerHandWidth}px`;
                gameCanvas.width = playerHandWidth; // Set backing store width
                gameCanvas.style.width = `${playerHandWidth}px`; // Set display width
                
                // Set height to a portion of viewport height, allowing aspect ratio to change
                const landscapeCanvasHeight = Math.max(500, window.innerHeight * 0.6); // 60% of viewport height
                gameCanvas.height = landscapeCanvasHeight; // Set backing store height
                gameCanvas.style.height = `${landscapeCanvasHeight}px`; // Set display height
                
            } else {
                // Fallback to a default fixed size if player hand not found
                // This maintains some predictability if the DOM isn't as expected.
                const defaultLandscapeWidth = 600;
                const defaultLandscapeHeight = 500;
                gameCanvas.width = defaultLandscapeWidth; 
                gameCanvas.height = defaultLandscapeHeight;
                gameCanvas.style.width = `${defaultLandscapeWidth}px`; 
                gameCanvas.style.height = `${defaultLandscapeHeight}px`;
            }

            gameCanvas.style.margin = "20px auto"; // Apply margin for centering
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
        if (longPressJustHappened) {
            longPressJustHappened = false; // Reset flag
            console.log("Click event ignored due to recent long press.");
            return;
        }

        const rect = gameCanvas.getBoundingClientRect();
        const scaleX = gameCanvas.width / rect.width;
        const scaleY = gameCanvas.height / rect.height;
        const pixelX = (event.clientX - rect.left) * scaleX;
        const pixelY = (event.clientY - rect.top) * scaleY;
        const { q, r } = pixelToHexGrid(pixelX, pixelY);

        console.log(`Canvas raw click at (${event.clientX - rect.left}, ${event.clientY - rect.top}), scaled to (${pixelX.toFixed(2)}, ${pixelY.toFixed(2)}), converted to hex grid (q=${q}, r=${r})`);

        if (isRemovingTiles) {
            const tileKey = `${q},${r}`;
            const clickedTileOnBoard = boardState[tileKey];
            if (clickedTileOnBoard && currentSurroundedTilesForRemoval.some(st => st.id === clickedTileOnBoard.id)) {
                if (navigator.maxTouchPoints > 0 && typeof navigator.vibrate === 'function') {
                    navigator.vibrate(100);
                    console.log("Device vibrated on tile tap for removal.");
                }
                removeTileFromBoardAndReturnToHand(clickedTileOnBoard);
            } else {
                console.log("Invalid selection. Click on a highlighted (surrounded) tile to remove it.");
                showToast("Click on a highlighted tile to remove it.");
            }
        } else {
            // --- Normal tile interaction (Not in removal mode) ---
            const gameMode = player1GameMode; // Game mode is unified
            const tileKey = `${q},${r}`;
            const clickedTileData = boardState[tileKey]; // Data of the tile on board at click location (q,r), if any.

            if (!selectedTile) {
                // NO TILE IS CURRENTLY SELECTED
                if (gameMode === "moving" && clickedTileData && clickedTileData.playerId === currentPlayer) {
                    // In "moving" mode, clicking own tile on board selects it.
                    selectTileFromBoard(clickedTileData, q, r);
                } else if (clickedTileData && clickedTileData.playerId !== currentPlayer) {
                    console.log("Cannot select opponent's tile.");
                    showToast("Cannot select opponent's tile.");
                } else {
                    // Clicked empty spot or non-selectable board tile when nothing is selected from hand.
                    console.log("Please select a tile from your hand, or one of your tiles on the board if in 'With Moving' mode.");
                    // No toast here, as it's a general "do something" prompt.
                }
            } else {
                // A TILE IS CURRENTLY SELECTED (selectedTile exists)
                if (selectedTile.originalPlayerId !== currentPlayer) {
                    console.error("Error: Selected tile's player ID does not match current player. Clearing selection.");
                    clearSelectionAndHighlights();
                    return; // Safety break
                }

                if (selectedTile.isBoardTile) {
                    // --- A BOARD TILE IS CURRENTLY SELECTED ---
                    // Current mode must be "moving" if a board tile is selected.
                    if (q === selectedTile.tile.x && r === selectedTile.tile.y) {
                        // Player clicked ON the ALREADY SELECTED board tile: ROTATE IT.
                        selectedTile.tile.rotate();
                        playerHasRotatedTileThisGame[currentPlayer] = true;
                        console.log(`Board tile ${selectedTile.tile.id} rotated on board. New orientation: ${selectedTile.tile.orientation}`);
                        updateMoveHighlights(selectedTile.tile, selectedTile.maxMoveDistance);
                        // showToast("Tile rotated. Tap again to rotate, or tap valid spot to move/finalize.");
                    } else if (clickedTileData && clickedTileData.playerId === currentPlayer && gameMode === "moving") {
                        // Player clicked on ANOTHER of their own tiles on the board (and in "moving" mode)
                        // -> Deselect current board tile, select this new one.
                        console.log(`Switching board selection from ${selectedTile.tile.id} to ${clickedTileData.id}`);
                        clearSelectionAndHighlights(false); // Clear previous without full board redraw yet
                        selectTileFromBoard(clickedTileData, q, r); // Select the new board tile
                    } else {
                        // Player clicked SOMEWHERE ELSE on the board (empty spot, opponent tile, or own tile not in moving mode for selection switch)
                        // This could be to move the selected board tile, or an invalid spot leading to deselection.
                        const moveAttemptValid = handleCellClick(q, r); // Tries to move selectedTile.tile to (q,r)
                        if (!moveAttemptValid) {
                            // Move was invalid. Deselect.
                            console.log("Invalid move for selected board tile. Deselecting tile.");
                            // showToast("Invalid move or spot. Tile deselected.");
                            clearSelectionAndHighlights();
                        }
                        // If moveAttemptValid is true, selectedTile is already cleared by handleCellClick/moveTileOnBoard.
                    }
                } else {
                    // --- A HAND TILE IS CURRENTLY SELECTED ---
                    if (clickedTileData) {
                        // Clicked on an EXISTING TILE ON THE BOARD while a HAND tile is selected.
                        if (gameMode === "moving" && clickedTileData.playerId === currentPlayer) {
                            // In "moving" mode, and clicked one of player's own tiles on board.
                            // -> This means: DESELECT current HAND tile, and SELECT this BOARD tile.
                            console.log(`Switching from selected hand tile ${selectedTile.tile.id} to board tile ${clickedTileData.id}`);
                            clearSelectionAndHighlights(false); // Clear hand tile selection visuals but don't full redraw board yet.
                            selectTileFromBoard(clickedTileData, q, r); // Select the clicked board tile.
                        } else {
                            // Clicked on an opponent's tile, or player's own tile but not in "moving" mode (or some other edge case).
                            // This spot is effectively "occupied" or "invalid" for placing the current hand tile. Deselect hand tile.
                            console.log("Invalid placement: Spot occupied or not selectable for current action. Deselecting hand tile.");
                            // showToast("Cannot place tile here. Hand tile deselected.");
                            clearSelectionAndHighlights();
                        }
                    } else {
                        // Clicked on an EMPTY SPOT ON THE BOARD while a HAND tile is selected.
                        // Attempt to place the hand tile.
                        const placementAttemptValid = handleCellClick(q, r); // Tries to place selectedTile.tile at (q,r)
                        if (!placementAttemptValid) {
                            // Placement was invalid (e.g., no match, enclosed space for basic, disconnects board). Deselect.
                            console.log("Invalid placement for hand tile. Deselecting tile.");
                            // showToast("Invalid placement. Hand tile deselected.");
                            clearSelectionAndHighlights();
                        }
                        // If placementAttemptValid is true, selectedTile is cleared by handleCellClick/placeTileOnBoard.
                    }
                }
            }
        }
    });

    // --- Long Press Handling ---
    function handleLongPressPlay(q, r) {
        console.log(`Long press detected on selected board tile at (${q}, ${r}). Attempting to finalize placement.`);
        if (!selectedTile || !selectedTile.isBoardTile || selectedTile.tile.x !== q || selectedTile.tile.y !== r) {
            console.log("Long press conditions not met (no selected board tile at this location).");
            return;
        }

        // Attempt to "play" or "finalize" the tile in its current position and orientation.
        // This uses moveTileOnBoard with 0-distance to re-validate and finalize.
        const finalizedSuccessfully = moveTileOnBoard(selectedTile.tile, q, r, q, r, selectedTile.maxMoveDistance);

        if (finalizedSuccessfully) {
            // moveTileOnBoard already handles clearing selectedTile, scoring, and switching turn.
            showToast("Tile moved zero spaces");
        } else {
            // moveTileOnBoard shows a toast for specific error. We can add a generic one too.
            showToast("Tile must be rotated to place here.");
            // Tile remains selected for the player to try another action or rotation.
            // updateMoveHighlights is already called by moveTileOnBoard on failure.
        }
    }

    gameCanvas.addEventListener('mousedown', (event) => {
        longPressJustHappened = false; // Reset on new press
        if (event.button !== 0) return; // Only main (left) click

        const rect = gameCanvas.getBoundingClientRect();
        const scaleX = gameCanvas.width / rect.width;
        const scaleY = gameCanvas.height / rect.height;
        const pixelX = (event.clientX - rect.left) * scaleX;
        const pixelY = (event.clientY - rect.top) * scaleY;
        const { q, r } = pixelToHexGrid(pixelX, pixelY);

        if (selectedTile && selectedTile.isBoardTile && selectedTile.tile.x === q && selectedTile.tile.y === r) {
            pressStartTime = Date.now();
            pressStartCoords = { x: pixelX, y: pixelY };

            if (longPressTimer) clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => {
                console.log("Long press timer fired.");
                longPressJustHappened = true; // Set flag so click listener ignores this
                handleLongPressPlay(q, r);
                longPressTimer = null; // Timer has done its job
                pressStartCoords = null; // Reset press start coords
            }, LONG_PRESS_DURATION);
        }
    });

    gameCanvas.addEventListener('mouseup', (event) => {
        if (event.button !== 0) return;
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            console.log("Mouseup: Long press timer cleared before firing (short click).");
        }
        pressStartCoords = null; // Reset on mouseup
        // If longPressJustHappened is true, it means the timer fired, and the click handler will ignore the click.
        // If longPressTimer was cleared, it means it was a short click, and the click handler will proceed.
    });

    gameCanvas.addEventListener('mousemove', (event) => {
        if (longPressTimer && pressStartCoords) {
            const rect = gameCanvas.getBoundingClientRect();
            const scaleX = gameCanvas.width / rect.width;
            const scaleY = gameCanvas.height / rect.height;
            const currentPixelX = (event.clientX - rect.left) * scaleX;
            const currentPixelY = (event.clientY - rect.top) * scaleY;

            const deltaX = Math.abs(currentPixelX - pressStartCoords.x);
            const deltaY = Math.abs(currentPixelY - pressStartCoords.y);
            const MOVEMENT_THRESHOLD = 10; // pixels

            if (deltaX > MOVEMENT_THRESHOLD || deltaY > MOVEMENT_THRESHOLD) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
                pressStartCoords = null;
                console.log("Mousemove: Long press cancelled due to movement.");
            }
        }
    });

    gameCanvas.addEventListener('mouseout', (event) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            pressStartCoords = null;
            console.log("Mouseout: Long press cancelled.");
        }
    });

    // Touch equivalents
    gameCanvas.addEventListener('touchstart', (event) => {
        longPressJustHappened = false;
        if (event.touches.length > 1) { // Ignore multi-touch
             if (longPressTimer) clearTimeout(longPressTimer);
             longPressTimer = null;
             pressStartCoords = null;
             return;
        }
        const touch = event.touches[0];
        const rect = gameCanvas.getBoundingClientRect();
        const scaleX = gameCanvas.width / rect.width;
        const scaleY = gameCanvas.height / rect.height;
        const pixelX = (touch.clientX - rect.left) * scaleX;
        const pixelY = (touch.clientY - rect.top) * scaleY;
        const { q, r } = pixelToHexGrid(pixelX, pixelY);

        if (selectedTile && selectedTile.isBoardTile && selectedTile.tile.x === q && selectedTile.tile.y === r) {
            pressStartTime = Date.now();
            pressStartCoords = { x: pixelX, y: pixelY };

            if (longPressTimer) clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => {
                console.log("Long press timer fired (touch).");
                longPressJustHappened = true;
                handleLongPressPlay(q, r);
                longPressTimer = null;
                pressStartCoords = null;
            }, LONG_PRESS_DURATION);
        }
        // event.preventDefault(); // Prevent mouse events from firing after touch, if needed and doesn't break panning
    }, { passive: false }); // passive: false if preventDefault is used

    gameCanvas.addEventListener('touchend', (event) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            console.log("Touchend: Long press timer cleared (short tap).");
        }
        pressStartCoords = null;
        // The click event should still fire after touchend for short taps.
        // longPressJustHappened flag will handle preventing click action if long press occurred.
    });

    gameCanvas.addEventListener('touchmove', (event) => {
        if (longPressTimer && pressStartCoords) {
            if (event.touches.length > 1) {
                 clearTimeout(longPressTimer);
                 longPressTimer = null;
                 pressStartCoords = null;
                 return;
            }
            const touch = event.touches[0];
            const rect = gameCanvas.getBoundingClientRect();
            const scaleX = gameCanvas.width / rect.width;
            const scaleY = gameCanvas.height / rect.height;
            const currentPixelX = (touch.clientX - rect.left) * scaleX;
            const currentPixelY = (touch.clientY - rect.top) * scaleY;

            const deltaX = Math.abs(currentPixelX - pressStartCoords.x);
            const deltaY = Math.abs(currentPixelY - pressStartCoords.y);
            const MOVEMENT_THRESHOLD = 10; // pixels

            if (deltaX > MOVEMENT_THRESHOLD || deltaY > MOVEMENT_THRESHOLD) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
                pressStartCoords = null;
                console.log("Touchmove: Long press cancelled due to movement.");
            }
        }
        // event.preventDefault(); // If scrolling/panning needs to be prevented during potential long press
    }, { passive: false }); // passive: false if preventDefault is used

    gameCanvas.addEventListener('touchcancel', (event) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            pressStartCoords = null;
            console.log("Touchcancel: Long press cancelled.");
        }
    });


    function clearSelectionAndHighlights(fullRedraw = true) {
        if (selectedTile) {
            if (selectedTile.isBoardTile) {
                // If previously selected tile was a board tile
                if (selectedTile.handElement && selectedTile.handElement.parentNode) { // handElement should be null now for board tiles
                    selectedTile.handElement.remove(); // Remove its temp hand canvas if it somehow existed
                }
                // Revert its orientation to what it was when initially selected from the board
                // This happens if it's deselected without a move being made.
                const boardTileInstance = boardState[`${selectedTile.originalX},${selectedTile.originalY}`];
                if (boardTileInstance && boardTileInstance.id === selectedTile.tile.id) { // Ensure it's the same tile
                    // Only revert orientation if it's different from the original.
                    // This prevents unnecessary console logs if it was selected and deselected without rotation.
                    if (boardTileInstance.orientation !== selectedTile.originalOrientation) {
                        boardTileInstance.orientation = selectedTile.originalOrientation;
                        console.log(`Board tile ${boardTileInstance.id} at (${selectedTile.originalX},${selectedTile.originalY}) reverted to orientation ${boardTileInstance.orientation} on deselection.`);
                    }
                }
            } else if (!selectedTile.isBoardTile && selectedTile.handElement) {
                // If it was a regular hand tile (not a board tile), redraw it unselected.
                const prevCtx = selectedTile.handElement.getContext('2d');
                prevCtx.clearRect(0, 0, selectedTile.handElement.width, selectedTile.handElement.height);
                const zoomForHandTile = HAND_TILE_BASE_SIDE_LENGTH / BASE_HEX_SIDE_LENGTH;
                const playerHand = selectedTile.originalPlayerId === 1 ? player1Hand : player2Hand;
                const originalHandTile = playerHand.find(t => t.id === selectedTile.tile.id);
                if (originalHandTile) {
                     drawHexTile(prevCtx, selectedTile.handElement.width / 2, selectedTile.handElement.height / 2, originalHandTile, zoomForHandTile, false, false);
                } else {
                    drawHexTile(prevCtx, selectedTile.handElement.width / 2, selectedTile.handElement.height / 2, selectedTile.tile, zoomForHandTile, false, false);
                }
            }
        }
        selectedTile = null;
        currentlySelectedTileCanvas = null; // This was primarily for hand tile canvas, ensure it's cleared.
        mouseHoverQ = null; // Clear mouse hover state as well
        mouseHoverR = null;

        if (fullRedraw) {
            redrawBoardOnCanvas(); // Clear any board highlights (green/yellow/blue spots, full previews)
                                   // This will also redraw the board tiles without specific selection highlights
                                   // if drawHexTile is correctly updated later for board selection.
        }
        // If not fullRedraw, the caller (e.g., when switching selection) will handle subsequent highlight updates.
    }

    function selectTileFromBoard(tile, q, r) {
        console.log(`Attempting to select tile ${tile.id} from board at (${q},${r}) for moving.`);
        if (tile.playerId !== currentPlayer) {
            console.log("Cannot select opponent's tile.");
            return;
        }

        // Clear moved tile shadow if the current player is selecting a tile from board and they were not the one who moved.
        if (lastMovedTileOriginalPosition && lastMovedTileOriginalPosition.playerId !== currentPlayer) {
            lastMovedTileOriginalPosition = null;
            console.log("Cleared moved tile shadow because next player selected a tile from board.");
            // No need to redraw here, as updateMoveHighlights will trigger redraw.
        }

        // Calculate max move distance (number of blank edges)
        const blankEdges = tile.getOrientedEdges().filter(edge => edge === 0).length;
        // The all-triangles tile (0 blank edges) cannot move.
        // The problem statement says "up to as many spots... as it has blank edges".
        // "A tile can move 0 spots (rotating in place)"
        // So even if blankEdges is 0, we should still select it to allow rotation.

        // Deselect any currently selected tile (from hand or board)
        if (selectedTile) {
            // If a board tile was previously selected, its 'handElement' (temp canvas) would be removed by clearSelectionAndHighlights.
            // If a hand tile was selected, it would be redrawn without highlight by clearSelectionAndHighlights.
            clearSelectionAndHighlights(false); // Clear previous selection, but don't full redraw board yet.
                                                // updateMoveHighlights below will do it.
        }

        selectedTile = {
            tile: tile, // This is the actual tile object from boardState
            handElement: null, // No longer using a handElement for board-selected tiles
            originalPlayerId: tile.playerId,
            isBoardTile: true,
            originalX: q,
            originalY: r,
            originalOrientation: tile.orientation, // Store original orientation
            maxMoveDistance: blankEdges
        };
        // currentlySelectedTileCanvas = null; // No longer using this for board selections directly

        // The tile on the board will be highlighted by updateMoveHighlights.
        // Rotation will be handled by clicking the tile on the board itself.

        console.log(`Selected tile ${tile.id} from board at (${q},${r}). Max move: ${blankEdges} spots. Tap selected tile on board to rotate, or click valid spot to move.`);
        updateMoveHighlights(tile, blankEdges); // This will draw the board and highlights including the selected tile.
        showToast("Tap to rotate. Press and hold to move zero spaces.");
    }


    function updateMoveHighlights(tileToMove, maxDistance) {
        redrawBoardOnCanvas(); // Redraw existing tiles first

        const originalTileX = tileToMove.x;
        const originalTileY = tileToMove.y;

        // Highlight the original spot of the tile being moved
        drawPlacementPreview(originalTileX, originalTileY, tileToMove, 'rgba(128, 0, 128, 0.5)'); // Purple for origin

        const possibleMoves = getAllPossibleMoves(boardState, currentPlayer);
        const currentSelectedOrientation = tileToMove.orientation;

        const greenSpots = new Set();
        const yellowSpots = new Map();

        const uniqueOrientations = getUniqueOrientations(tileToMove);
        const numUniqueOrientations = uniqueOrientations.length;

        for (const move of possibleMoves) {
            if (move.tile.id === tileToMove.id) {
                const key = `${move.x},${move.y}`;
                if ((currentSelectedOrientation % numUniqueOrientations) === (move.orientation % numUniqueOrientations)) {
                    greenSpots.add(key);
                } else {
                    if (!yellowSpots.has(key)) {
                        yellowSpots.set(key, move.orientation);
                    }
                }
            }
        }

        for (const key of greenSpots) {
            const [q, r] = key.split(',').map(Number);
            drawPlacementPreview(q, r, tileToMove, 'green');
        }

        for (const [key, orientation] of yellowSpots.entries()) {
            if (!greenSpots.has(key)) {
                const [q, r] = key.split(',').map(Number);
                const tempTileForYellowPreview = new HexTile(tileToMove.id, tileToMove.playerId, [...tileToMove.edges]);
                tempTileForYellowPreview.orientation = orientation;
                drawPlacementPreview(q, r, tempTileForYellowPreview, 'yellow');
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

                // Draw full tile preview if hovering over a valid spot
                const tileToPlace = selectedTile.tile;
                let isSpotHighlightedGreenOrYellow = false;
                if (!boardState[`${q},${r}`]) {
                    const originalOrientation = tileToPlace.orientation;
                    if (window.isPlacementValid(tileToPlace, q, r, boardState, true)) {
                        isSpotHighlightedGreenOrYellow = true;
                    } else {
                        for (let i = 0; i < 6; i++) {
                            if (i === originalOrientation) continue;
                            tileToPlace.orientation = i;
                            if (window.isPlacementValid(tileToPlace, q, r, boardState, true)) {
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

        if (selectedTile.isBoardTile) {
            updateMoveHighlights(selectedTile.tile, selectedTile.maxMoveDistance);
        } else {
            updatePlacementHighlights();
        }

        const tileToPreview = selectedTile.tile;
        let shouldShowFullPreview = false;

        if (selectedTile.isBoardTile) {
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
            if (!boardState[`${q},${r}`]) {
                const originalOrientation = tileToPreview.orientation;
                if (window.isPlacementValid(tileToPreview, q, r, boardState, true)) {
                    shouldShowFullPreview = true;
                } else {
                    for (let i = 0; i < 6; i++) {
                        if (i === originalOrientation) continue;
                        tileToPreview.orientation = i;
                        if (window.isPlacementValid(tileToPreview, q, r, boardState, true)) {
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
            player1GameMode: player1GameMode, // Persist Player 1's game mode (now the game-wide mode)
            player1MadeFirstMove: player1MadeFirstMove, // Persist Player 1's first move status
            player2MadeFirstMove: player2MadeFirstMove, // Persist Player 2's first move status (may still be useful for UI)
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
                player1GameMode: savedState.player1GameMode || "basic", // Restore P1 game mode (game-wide mode)
                player1MadeFirstMove: savedState.player1MadeFirstMove || false, // Restore P1 first move status
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
    runTests();
});
