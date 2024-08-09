const mongoose = require("mongoose");
const bcrypt = require("bcrypt");


require('dotenv').config()
mongoose.connect(process.env.MONGOOSE_DB_LINK, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
    .then(() => console.log('MongoDB connection successful'))
    .catch(err => console.error('MongoDB connection error:', err));


    // Define the game_loop schema
const game_loop = new mongoose.Schema({
  round_number: {
    type: Number,
    default: 1
  },
  active_player_id_list: {
    type: [String],
    default: []
  },
  multiplier_crash: {
    type: Number,
    default: 0
  },
  previous_crashes: {
    type: [Number],
    default: []  // Initialize as an empty array
  },
  b_betting_phase: {
    type: Boolean,
    default: false
  },
  b_game_phase: {
    type: Boolean,
    default: false
  },
  b_cashout_phase: {
    type: Boolean,
    default: false
  },
  time_now: {
    type: Number,
    default: -1
  },
  previous_crashes: {
    type: [Number],
    default: []
  },
  round_id_list: {
    type: [Number],
    default: []
  },
  chat_messages_list: {
    type: [],
    default: []
  },

});
// Create the game_loop model
const GameLoop = mongoose.model("game_loop", game_loop);

// Define the user schema
const userSchema = new mongoose.Schema({
    username: {
      type: String,
      required: true
    },
    password: {
      type: String,
      required: true
    },
    balance: {
      type: Number,
      default: 1000
    },
    bet_amount: {
      type: Number,
      default: 0
    },
    payout_multiplier: {
      type: Number,
      default: 0
    },
  
  });
  
// Create the user model
const User = mongoose.model("User", userSchema);

// Function to create initial documents
async function createInitialDocuments() {
  try {
    // Create a game_loop document
    const game_loop = new GameLoop();
    await game_loop.save();

    // Create a user document with hashed password
    const hashedPassword = await bcrypt.hash("password123", 10);
    const user = new User({
      username: "testuser",
      password: hashedPassword
    });
    await user.save();

    console.log("Documents created successfully!");
  } catch (error) {
    console.error("Error creating documents:", error);
  } finally {
    mongoose.connection.close();
  }
}

createInitialDocuments();
