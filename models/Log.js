const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  action: String,
  timestamp: { type: Date, default: Date.now },
  meta: Object
});

module.exports = mongoose.model('Log', logSchema);
