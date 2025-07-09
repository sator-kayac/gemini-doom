class Node {
    constructor(x, y, walkable) {
        this.x = x;
        this.y = y;
        this.walkable = walkable;
        this.g = 0; // Cost from start node
        this.h = 0; // Estimated cost to end node (heuristic)
        this.f = 0; // g + h
        this.parent = null;
    }
}

class AStarFinder {
    constructor(grid) {
        this.grid = grid;
        this.openSet = [];
        this.closedSet = [];
    }

    findPath(startX, startY, endX, endY) {
        // Reset node states for each pathfinding call
        for (let x = 0; x < GRID_SIZE; x++) {
            for (let y = 0; y < GRID_SIZE; y++) {
                this.grid[x][y].g = 0;
                this.grid[x][y].h = 0;
                this.grid[x][y].f = 0;
                this.grid[x][y].parent = null;
            }
        }

        this.openSet = [];
        this.closedSet = [];

        const startNode = this.grid[startX][startY];
        const endNode = this.grid[endX][endY];

        this.openSet.push(startNode);

        while (this.openSet.length > 0) {
            let lowestFIndex = 0;
            for (let i = 0; i < this.openSet.length; i++) {
                if (this.openSet[i].f < this.openSet[lowestFIndex].f) {
                    lowestFIndex = i;
                }
            }
            const currentNode = this.openSet[lowestFIndex];

            if (currentNode === endNode) {
                return this.reconstructPath(currentNode);
            }

            this.openSet.splice(lowestFIndex, 1);
            this.closedSet.push(currentNode);

            const neighbors = this.getNeighbors(currentNode);
            for (const neighbor of neighbors) {
                if (this.closedSet.includes(neighbor) || !neighbor.walkable) {
                    continue;
                }

                const tentativeG = currentNode.g + 1; // Cost to neighbor is 1

                if (!this.openSet.includes(neighbor) || tentativeG < neighbor.g) {
                    neighbor.g = tentativeG;
                    neighbor.h = this.heuristic(neighbor, endNode);
                    neighbor.f = neighbor.g + neighbor.h;
                    neighbor.parent = currentNode;

                    if (!this.openSet.includes(neighbor)) {
                        this.openSet.push(neighbor);
                    }
                }
            }
        }
        return []; // Path not found
    }

    getNeighbors(node) {
        const neighbors = [];
        const directions = [
            { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
            { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
        ];

        for (const dir of directions) {
            const nx = node.x + dir.dx;
            const ny = node.y + dir.dy;

            if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                neighbors.push(this.grid[nx][ny]);
            }
        }
        return neighbors;
    }

    heuristic(nodeA, nodeB) {
        // Manhattan distance
        return Math.abs(nodeA.x - nodeB.x) + Math.abs(nodeA.y - nodeB.y);
    }

    reconstructPath(currentNode) {
        const path = [];
        while (currentNode !== null) {
            path.push({ x: currentNode.x, y: currentNode.y });
            currentNode = currentNode.parent;
        }
        return path.reverse();
    }
}

// Grid-based pathfinding settings
const GRID_SIZE = 50; // Map size (e.g., from -25 to 25)
const CELL_SIZE = 1; // Size of one grid cell
const GRID_OFFSET = GRID_SIZE / 2; // For converting world coordinates to grid indices

// Grid map (initialized with Node objects)
const grid = Array(GRID_SIZE).fill(0).map((_, x) => 
    Array(GRID_SIZE).fill(0).map((_, y) => new Node(x, y, true))
);

const aStarFinder = new AStarFinder(grid);

// Listen for messages from the main thread
self.onmessage = function(e) {
    const { type, startX, startY, endX, endY, enemyId, wall } = e.data;

    if (type === 'findPath') {
        const path = aStarFinder.findPath(startX, startY, endX, endY);
        self.postMessage({ type: 'pathResult', path: path, enemyId: enemyId });
    }

    if (type === 'updateWall') {
        const startX = Math.floor((wall.x - wall.halfWidth + GRID_OFFSET) / CELL_SIZE);
        const endX = Math.floor((wall.x + wall.halfWidth + GRID_OFFSET) / CELL_SIZE);
        const startZ = Math.floor((wall.z - wall.halfDepth + GRID_OFFSET) / CELL_SIZE);
        const endZ = Math.floor((wall.z + wall.halfDepth + GRID_OFFSET) / CELL_SIZE);

        for (let i = startX; i < endX; i++) {
            for (let j = startZ; j < endZ; j++) {
                if (i >= 0 && i < GRID_SIZE && j >= 0 && j < GRID_SIZE) {
                    grid[i][j].walkable = false; // Mark as non-walkable
                }
            }
        }
    }
};