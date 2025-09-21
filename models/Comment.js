const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  commentId: String,
  text: String,
  videoId: String,
  parentId: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Comment', commentSchema);
