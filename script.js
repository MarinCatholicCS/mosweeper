// Game configuration
const ROWS = 9;
const COLS = 9;
const MINES = 4;

const API_URL = 'https://script.google.com/macros/s/AKfycbxGmBC7asHnpngfgSwQqtxig3notnM4CxTBhTQlUh5duSOHidgBKPSnvCg4ha0oC71GrQ/exec';

// Initialize Leaderboard Manager
let leaderboardManager;
if (API_URL && API_URL !== 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
    leaderboardManager = new LeaderboardManager(API_URL);
}

// Game state
let board = [];
let mineLocations = new Set();
let revealedCells = 0;
let flaggedCells = 0;
let gameStarted = false;
let gameOver = false;
let startTime = null;
let timerInterval = null;

// DOM elements
const boardElement = document.getElementById('board');
const mineCountElement = document.getElementById('mine-count');
const timerElement = document.getElementById('timer');
const resetBtn = document.getElementById('reset-btn');
const gameOverOverlay = document.getElementById('game-over-overlay');
const gameOverIcon = document.getElementById('game-over-icon');
const gameOverTitle = document.getElementById('game-over-title');
const finalTimeElement = document.getElementById('final-time');
const playAgainBtn = document.getElementById('play-again-btn');

// Initialize game
function initGame() {
    board = [];
    mineLocations = new Set();
    revealedCells = 0;
    flaggedCells = 0;
    gameStarted = false;
    gameOver = false;
    startTime = null;

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    timerElement.textContent = '0.00';
    mineCountElement.textContent = MINES;
    gameOverOverlay.classList.remove('show');

    createBoard();
    renderBoard();
}

// Create the board structure
function createBoard() {
    for (let row = 0; row < ROWS; row++) {
        board[row] = [];
        for (let col = 0; col < COLS; col++) {
            board[row][col] = {
                isMine: false,
                isRevealed: false,
                isFlagged: false,
                neighborMines: 0
            };
        }
    }
}

// Place mines randomly (avoiding first clicked cell)
function placeMines(firstRow, firstCol) {
    let minesPlaced = 0;

    while (minesPlaced < MINES) {
        const row = Math.floor(Math.random() * ROWS);
        const col = Math.floor(Math.random() * COLS);

        // Don't place mine on first clicked cell or its neighbors
        if (Math.abs(row - firstRow) <= 1 && Math.abs(col - firstCol) <= 1) {
            continue;
        }

        const key = `${row},${col}`;
        if (!mineLocations.has(key)) {
            mineLocations.add(key);
            board[row][col].isMine = true;
            minesPlaced++;
        }
    }

    calculateNeighborMines();
}

// Calculate neighbor mine counts
function calculateNeighborMines() {
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            if (!board[row][col].isMine) {
                board[row][col].neighborMines = countNeighborMines(row, col);
            }
        }
    }
}

// Count mines in neighboring cells
function countNeighborMines(row, col) {
    let count = 0;

    for (let dRow = -1; dRow <= 1; dRow++) {
        for (let dCol = -1; dCol <= 1; dCol++) {
            if (dRow === 0 && dCol === 0) continue;

            const newRow = row + dRow;
            const newCol = col + dCol;

            if (isValidCell(newRow, newCol) && board[newRow][newCol].isMine) {
                count++;
            }
        }
    }

    return count;
}

// Check if cell coordinates are valid
function isValidCell(row, col) {
    return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

// Render the board
function renderBoard() {
    boardElement.innerHTML = '';

    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = row;
            cell.dataset.col = col;

            // Add staggered animation delay
            cell.style.animationDelay = `${(row * COLS + col) * 0.01}s`;

            cell.addEventListener('click', () => handleCellClick(row, col));
            cell.addEventListener('contextmenu', (e) => handleRightClick(e, row, col));

            updateCellDisplay(cell, row, col);
            boardElement.appendChild(cell);
        }
    }
}

// Update cell display
function updateCellDisplay(cellElement, row, col) {
    const cell = board[row][col];

    cellElement.classList.remove('revealed', 'flagged', 'mine', 'wrong-flag');
    cellElement.textContent = '';
    cellElement.removeAttribute('data-count');

    if (cell.isFlagged) {
        cellElement.classList.add('flagged');
    } else if (cell.isRevealed) {
        cellElement.classList.add('revealed');

        if (cell.isMine) {
            cellElement.classList.add('mine');
        } else if (cell.neighborMines > 0) {
            cellElement.textContent = cell.neighborMines;
            cellElement.dataset.count = cell.neighborMines;
        }
    }
}

// Handle cell click
function handleCellClick(row, col) {
    if (gameOver) return;

    const cell = board[row][col];

    if (cell.isFlagged || cell.isRevealed) return;

    // Start game on first click
    if (!gameStarted) {
        gameStarted = true;
        placeMines(row, col);
        startTimer();
    }

    revealCell(row, col);
}

// Handle right click (flag)
function handleRightClick(event, row, col) {
    event.preventDefault();

    if (gameOver || !gameStarted) return;

    const cell = board[row][col];

    if (cell.isRevealed) return;

    cell.isFlagged = !cell.isFlagged;

    if (cell.isFlagged) {
        flaggedCells++;
    } else {
        flaggedCells--;
    }

    mineCountElement.textContent = MINES - flaggedCells;

    const cellElement = boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    updateCellDisplay(cellElement, row, col);
}

// Reveal a cell
function revealCell(row, col) {
    if (!isValidCell(row, col)) return;

    const cell = board[row][col];

    if (cell.isRevealed || cell.isFlagged) return;

    cell.isRevealed = true;
    revealedCells++;

    const cellElement = boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    updateCellDisplay(cellElement, row, col);

    if (cell.isMine) {
        endGame(false);
        return;
    }

    // Auto-reveal neighbors if no neighboring mines
    if (cell.neighborMines === 0) {
        for (let dRow = -1; dRow <= 1; dRow++) {
            for (let dCol = -1; dCol <= 1; dCol++) {
                if (dRow === 0 && dCol === 0) continue;
                revealCell(row + dRow, col + dCol);
            }
        }
    }

    // Check for win
    if (revealedCells === ROWS * COLS - MINES) {
        endGame(true);
    }
}

// Start timer
function startTimer() {
    startTime = Date.now();

    timerInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        timerElement.textContent = elapsed.toFixed(2);
    }, 10);
}

// End game
function endGame(won) {
    gameOver = true;

    if (timerInterval) {
        clearInterval(timerInterval);
    }

    const finalTime = ((Date.now() - startTime) / 1000);

    // Reveal all mines
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const cell = board[row][col];
            const cellElement = boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);

            if (cell.isMine && !won) {
                cell.isRevealed = true;
                updateCellDisplay(cellElement, row, col);
            }

            if (cell.isFlagged && !cell.isMine) {
                cellElement.classList.add('wrong-flag');
            }
        }
    }

    // Show game over overlay briefly, then modal
    setTimeout(() => {
        if (leaderboardManager) {
            leaderboardManager.showGameOverModal(won, finalTime);
        }
    }, 300);
}

// Event listeners
resetBtn.addEventListener('click', initGame);
//playAgainBtn.addEventListener('click', initGame);

// Initialize game on load
initGame();

// Initialize permanent leaderboard if API is configured
if (leaderboardManager) {
    leaderboardManager.createPermanentLeaderboard();
}