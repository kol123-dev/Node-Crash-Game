const mongoose = require('mongoose');
require('dotenv').config()

mongoose.connect(process.env.MONGOOSE_DB_LINK, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB connection successful'))
  .catch(err => console.error('MongoDB connection error:', err));

  console.log('MongoDB URI:', process.env.MONGOOSE_DB_LINK);
