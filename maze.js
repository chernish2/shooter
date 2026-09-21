// Procedural maze generation using a randomized recursive backtracker
// (iterative DFS). Grid is odd-sized: cells at odd indices, walls between.

function generateMaze(cols, rows) {
    // cols/rows = number of CELLS. Full grid is (2*cols+1) x (2*rows+1).
    const W = 2 * cols + 1;
    const H = 2 * rows + 1;
    const grid = new Uint8Array(W * H); // 1 = wall, 0 = floor

    const idx = (x, y) => y * W + x;
    for (let i = 0; i < W * H; i++) grid[i] = 1;

    const stack = [[1, 1]];
    grid[idx(1, 1)] = 0;

    const dirs = [
        [0, -1], [0, 1], [-1, 0], [1, 0]
    ];

    while (stack.length) {
        const [cx, cy] = stack[stack.length - 1];
        // collect unvisited neighbors (2 cells away)
        const options = [];
        for (const [dx, dy] of dirs) {
            const nx = cx + dx * 2;
            const ny = cy + dy * 2;
            if (nx >= 1 && nx < W - 1 && ny >= 1 && ny < H - 1 && grid[idx(nx, ny)] === 1) {
                options.push([nx, ny, cx + dx, cy + dy]);
            }
        }
        if (options.length === 0) {
            stack.pop();
            continue;
        }
        const [nx, ny, wx, wy] = options[Math.floor(Math.random() * options.length)];
        grid[idx(wx, wy)] = 0; // knock down wall between
        grid[idx(nx, ny)] = 0; // carve cell
        stack.push([nx, ny]);
    }

    return { grid, W, H };
}

// Carve out a few random extra openings to create loops (avoids dead-end-only maze,
// makes it more interesting to navigate).
function carveLoops(maze, count) {
    const { grid, W, H } = maze;
    const idx = (x, y) => y * W + x;
    let done = 0;
    let attempts = 0;
    while (done < count && attempts < 2000) {
        attempts++;
        // pick a random wall cell
        const x = 1 + Math.floor(Math.random() * (W - 2));
        const y = 1 + Math.floor(Math.random() * (H - 2));
        if (grid[idx(x, y)] !== 1) continue;
        // knock out only if it connects two floors (not a corner)
        const horiz = grid[idx(x - 1, y)] === 0 && grid[idx(x + 1, y)] === 0;
        const vert = grid[idx(x, y - 1)] === 0 && grid[idx(x, y + 1)] === 0;
        if (horiz !== vert) { // exactly one axis connects -> a bridge
            grid[idx(x, y)] = 0;
            done++;
        }
    }
    return maze;
}

// Open some random cells as rooms (clear 3x3 or 5x3 areas) for breathing room.
function carveRooms(maze, count, size) {
    const { grid, W, H } = maze;
    const idx = (x, y) => y * W + x;
    for (let r = 0; r < count; r++) {
        const rx = 2 + Math.floor(Math.random() * (W - size - 4));
        const ry = 2 + Math.floor(Math.random() * (H - size - 4));
        for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
                const x = rx + dx;
                const y = ry + dy;
                if (x > 0 && x < W - 1 && y > 0 && y < H - 1) grid[idx(x, y)] = 0;
            }
        }
    }
    return maze;
}

// Build a list of floor cell coordinates (in grid units).
function floorCells(maze) {
    const { grid, W, H } = maze;
    const cells = [];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (grid[y * W + x] === 0) cells.push([x, y]);
        }
    }
    return cells;
}
