const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const apiRoutes = require('./routes/api');

dotenv.config();

const app = express();
app.disable('x-powered-by'); // prevent fingerprinting
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'));

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/index.html'));
});

app.listen(5000, () => {
  console.log('Server running on http://localhost:5000');
});
