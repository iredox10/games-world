const sdk = require("node-appwrite");

module.exports = async function (context) {
  const { req, res, log, error } = context;

  if (req.method !== "POST") {
    return res.json({ error: "Method not allowed" }, 405);
  }

  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new sdk.Databases(client);

  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    error("Failed to parse request body: " + req.body);
    return res.json({ error: "Invalid JSON in request body" }, 400);
  }

  const { gameId, index } = payload;
  const userId = req.headers["x-appwrite-user-id"];

  if (!gameId || index === undefined || !userId) {
    return res.json({ error: "Missing required fields" }, 400);
  }

  try {
    const game = await databases.getDocument("main", "games", gameId);

    if (game.status !== "playing") {
      return res.json({ error: "Game is not in playing status" }, 400);
    }

    if (game.turn !== userId) {
      return res.json({ error: "Not your turn" }, 403);
    }

    const board = JSON.parse(game.board);

    if (board[index] !== "") {
      return res.json({ error: "Invalid move, cell occupied" }, 400);
    }

    const symbol = userId === game.playerX ? "X" : "O";
    board[index] = symbol;

    // Check winner
    const winnerSymbol = checkWinner(board);
    let winner = null;
    let status = "playing";

    if (winnerSymbol) {
      winner = winnerSymbol === "X" ? game.playerX : game.playerO;
      status = "finished";
    } else if (!board.includes("")) {
      winner = "draw";
      status = "finished";
    }

    const nextTurn = userId === game.playerX ? game.playerO : game.playerX;

    const updatedGame = await databases.updateDocument("main", "games", gameId, {
      board: JSON.stringify(board),
      turn: nextTurn,
      winner: winner,
      status: status,
    });

    return res.json(updatedGame);
  } catch (err) {
    error(err.message);
    return res.json({ error: "Failed to process move", details: err.message }, 500);
  }
};

function checkWinner(board) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (let i = 0; i < lines.length; i++) {
    const [a, b, c] = lines[i];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}
