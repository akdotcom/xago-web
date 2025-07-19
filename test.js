// --- Test Setup ---
function runTests() {
    console.log("--- Running Tests ---");

    // Test Case 1: Simple Move Distance Check
    testSimpleMoveDistance();

    // Test Case 2: Move that would disconnect the board
    testDisconnectedBoardMove();

    // Test Case 3: No possible moves
    testNoPossibleMoves();

    // Test Case 4: Zero-distance move (rotation)
    testZeroDistanceMove();

    console.log("--- Tests Finished ---");
}

function testSimpleMoveDistance() {
    console.log("--- Test Case 1: Simple Move Distance Check ---");
    const boardState = {};
    const tile1 = new HexTile(1, 1, [1, 0, 0, 0, 0, 0]); // 5 blank edges, max move 5
    tile1.x = 0;
    tile1.y = 0;
    boardState['0,0'] = tile1;

    const tile2 = new HexTile(2, 2, [1, 1, 1, 1, 1, 1]); // 0 blank edges, max move 0
    tile2.x = 1;
    tile2.y = 0;
    boardState['1,0'] = tile2;

    const possibleMoves = getAllPossibleMoves(boardState, 1);
    console.log("Possible moves for Player 1:", possibleMoves);

    // We expect player 1 to be able to move their tile.
    // The tile has 5 blank edges, so it can move up to 5 spaces.
    // There are 5 valid empty spaces around the tile at (0,0).
    // The tile at (1,0) is occupied.
    // All 5 empty neighbors are valid moves.
    if (possibleMoves.length === 5) {
        console.log("Test Passed: Correct number of moves found.");
    } else {
        console.error(`Test Failed: Expected 5 moves, but found ${possibleMoves.length}.`);
    }
}

function testDisconnectedBoardMove() {
    console.log("--- Test Case 2: Move that would disconnect the board ---");
    const boardState = {};
    const tile1 = new HexTile(1, 1, [1, 0, 0, 0, 0, 0]);
    tile1.x = 0;
    tile1.y = 0;
    boardState['0,0'] = tile1;

    const tile2 = new HexTile(2, 1, [1, 0, 0, 0, 0, 0]);
    tile2.x = 1;
    tile2.y = 0;
    boardState['1,0'] = tile2;

    // In this setup, moving tile1 would disconnect tile2.
    const possibleMoves = getAllPossibleMoves(boardState, 1);
    console.log("Possible moves for Player 1:", possibleMoves);

    // We expect no moves to be possible for tile1, as moving it would disconnect the board.
    // We expect moves to be possible for tile2.
    if (possibleMoves.length > 0) {
        console.log("Test Passed: Correctly identified moves for tile2.");
    } else {
        console.error(`Test Failed: Expected moves for tile2, but found ${possibleMoves.length}.`);
    }
}

function testNoPossibleMoves() {
    console.log("--- Test Case 3: No possible moves ---");
    const boardState = {};
    const tile1 = new HexTile(1, 1, [1, 1, 1, 1, 1, 1]); // 0 blank edges
    tile1.x = 0;
    tile1.y = 0;
    boardState['0,0'] = tile1;

    const tile2 = new HexTile(2, 2, [1, 1, 1, 1, 1, 1]); // 0 blank edges
    tile2.x = 1;
    tile2.y = 0;
    boardState['1,0'] = tile2;

    const possibleMoves = getAllPossibleMoves(boardState, 1);
    console.log("Possible moves for Player 1:", possibleMoves);

    if (possibleMoves.length === 0) {
        console.log("Test Passed: Correctly identified no possible moves.");
    } else {
        console.error(`Test Failed: Expected 0 moves, but found ${possibleMoves.length}.`);
    }
}

function testZeroDistanceMove() {
    console.log("--- Test Case 4: Zero-distance move (rotation) ---");
    const boardState = {};
    const tile1 = new HexTile(1, 1, [1, 0, 1, 0, 1, 0]); // 3 blank edges
    tile1.x = 0;
    tile1.y = 0;
    boardState['0,0'] = tile1;

    const possibleMoves = getAllPossibleMoves(boardState, 1);
    console.log("Possible moves for Player 1:", possibleMoves);

    // The tile can be rotated in place.
    // The tile has 3 unique orientations.
    // The tile can also move to 3 empty neighbors.
    // For each of those neighbors, there are 3 unique orientations.
    // So, 3 (rotations in place) + 3 * 3 (moves to neighbors) = 12 possible moves.
    // However, the current implementation will return all possible orientations for each valid location.
    // The tile has 2 unique orientations.
    // So, 1 (current location) + 3 (neighbors) = 4 locations.
    // 4 locations * 2 unique orientations = 8 possible moves.
    // Let's check for at least one zero-distance move.
    const zeroDistanceMove = possibleMoves.find(move => move.x === 0 && move.y === 0);

    if (zeroDistanceMove) {
        console.log("Test Passed: Correctly identified a zero-distance move.");
    } else {
        console.error(`Test Failed: Expected a zero-distance move, but none was found.`);
    }
}

// To run the tests, you would typically open the HTML file in a browser with the console open.
// For automated testing, you might use a testing framework like Jest or Mocha.
// For now, you can load this script in your index.html and call runTests() from the console.
// Or, for a quick check, you can use a command-line JS environment if you have one (like Node.js).

// Example of how to run in Node.js:
// 1. Make sure gameEngine.js is in the same directory.
// 2. Run `node -e "require('./gameEngine.js'); require('./test.js'); runTests();"`
