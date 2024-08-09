const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const passport = require("passport");
const passportLocal = require("passport-local").Strategy;
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const bodyParser = require("body-parser");
const { Server } = require('socket.io');
const http = require('http');
const Stopwatch = require('statman-stopwatch');
const sw = new Stopwatch(true);

require('dotenv').config();

const app = express();
const User = require("./models/user");
const Game_loop = require("./models/game_loop");
const { update } = require("./models/user");

const GAME_LOOP_ID = '66b48e165295cb721af88e32';

// Socket.io setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("A user connected");
  socket.on("clicked", (data) => {
    console.log("Button clicked with data:", data);
  });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGOOSE_DB_LINK, {
  serverSelectionTimeoutMS: 30000 // Increase timeout
})
.then(async (connection) => {
  const db = connection.connection.db;
  console.log('MongoDB connected to database:', db.databaseName);

  // List collections
  const collections = await db.listCollections().toArray();
  console.log('Collections:', collections);

  // Log documents for each collection
  for (const collectionInfo of collections) {
    const collection = db.collection(collectionInfo.name);
    const documents = await collection.find({}).toArray();
    console.log(`Documents in collection ${collectionInfo.name}:`, documents);
  }
})
.catch(err => console.error('MongoDB connection error:', err));

// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));
app.use(session({
  secret: process.env.PASSPORT_SECRET,
  resave: true,
  saveUninitialized: true,
}));
app.use(cookieParser(process.env.PASSPORT_SECRET));
app.use(passport.initialize());
app.use(passport.session());
require("./passportConfig")(passport);

// Passport.js login/register system
app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(400).send("Username or Password is Wrong");
    
    req.logIn(user, (err) => {
      if (err) return next(err);
      res.send("Login Successful");
    });
  })(req, res, next);
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (username.length < 3 || password.length < 3) {
    return res.status(400).send("Username or Password too short");
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).send("Username already exists");

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.send("User registered successfully");
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// Authentication check middleware
function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).send("Not authenticated");
}

app.get("/user", checkAuthenticated, (req, res) => {
  res.send(req.user);
});

app.get("/logout", (req, res) => {
  req.logout();
  res.send("Logged out successfully");
});

// Game-related routes
app.get("/multiply", checkAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const gameLoop = await Game_loop.findById(GAME_LOOP_ID);
    if (!gameLoop || !user) return res.status(404).send("Game or user not found");

    user.balance += gameLoop.multiplier_crash;
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

app.get('/generate_crash_value', async (req, res) => {
  try {
    const randomInt = Math.floor(Math.random() * 6) + 1;
    const gameLoop = await Game_loop.findById(GAME_LOOP_ID);
    if (!gameLoop) return res.status(404).send("Game loop not found");

    gameLoop.multiplier_crash = randomInt;
    await gameLoop.save();
    res.json(randomInt);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

app.get('/retrieve', async (req, res) => {
  try {
    const gameLoop = await Game_loop.findById(GAME_LOOP_ID);
    if (!gameLoop) return res.status(404).send("Game loop not found");

    const crashMultiplier = gameLoop.multiplier_crash;
    res.json(crashMultiplier);

    const delta = sw.read(2);
    let seconds = (delta / 1000.0).toFixed(2);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

app.post('/send_bet', checkAuthenticated, async (req, res) => {
  try {
    if (!betting_phase) {
      return res.status(400).json({ customError: "IT IS NOT THE BETTING PHASE" });
    }

    const { bet_amount, payout_multiplier } = req.body;
    if (isNaN(bet_amount) || isNaN(payout_multiplier)) {
      return res.status(400).json({ customError: "Not a number" });
    }

    const gameLoop = await Game_loop.findById(GAME_LOOP_ID);
    const user = await User.findById(req.user.id);
    if (!gameLoop || !user) return res.status(404).send("Game loop or user not found");

    if (user.balance < bet_amount) {
      return res.status(400).json({ customError: "Bet too big" });
    }

    const alreadyBetting = gameLoop.active_player_id_list.includes(req.user.id);
    if (alreadyBetting) {
      return res.status(400).json({ customError: "You are already betting this round" });
    }

    user.bet_amount = bet_amount;
    user.payout_multiplier = payout_multiplier;
    user.balance -= bet_amount;
    await user.save();
    
    gameLoop.active_player_id_list.push(req.user.id);
    await gameLoop.save();

    live_bettors_table.push({
      the_user_id: req.user.id,
      the_username: req.user.username,
      bet_amount,
      cashout_multiplier: null,
      profit: null,
      b_bet_live: true,
    });

    io.emit("receive_live_betting_table", JSON.stringify(live_bettors_table));
    res.json(`Bet placed for ${req.user.username}`);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

app.get('/calculate_winnings', checkAuthenticated, async (req, res) => {
  try {
    const gameLoop = await Game_loop.findById(GAME_LOOP_ID);
    if (!gameLoop) return res.status(404).send("Game loop not found");

    const { active_player_id_list, multiplier_crash } = gameLoop;
    for (const playerId of active_player_id_list) {
      const user = await User.findById(playerId);
      if (user.payout_multiplier <= multiplier_crash) {
        user.balance += user.bet_amount * user.payout_multiplier;
        await user.save();
      }
    }

    gameLoop.active_player_id_list = [];
    await gameLoop.save();
    res.json("Winnings calculated and game loop updated");
  } catch (err) {
    res.status(500).send("Server error");
  }
});

app.get('/get_game_status', async (req, res) => {
  try {
    const gameLoop = await Game_loop.findById(GAME_LOOP_ID);
    if (!gameLoop) return res.status(404).json({ error: 'Game loop not found' });

    if (gameLoop.previous_crashes) {
      io.emit('crash_history', gameLoop.previous_crashes);
    } else {
      io.emit('crash_history', []); // Send an empty array if `previous_crashes` is null
    }

    io.emit('get_round_id_list', gameLoop.round_id_list);
    if (betting_phase) {
      res.json({ phase: 'betting_phase', info: phase_start_time });
    } else if (game_phase) {
      res.json({ phase: 'game_phase', info: phase_start_time });
    } else {
      res.json({ phase: 'unknown', info: null });
    }
  } catch (err) {
    res.status(500).send("Server error");
  }
});

app.get('/manual_cashout_early', checkAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).send("User not found");

    if (user.bet_amount <= 0) return res.status(400).send("No active bet");

    user.balance += user.bet_amount * user.payout_multiplier;
    user.bet_amount = 0;
    await user.save();

    res.json("Early cashout successful");
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// Error handling for unsupported routes
app.use((req, res) => {
  res.status(404).send("Not Found");
});

const port = process.env.PORT || 4000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
