const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('PDF backend is running!');
});

app.post('/submit', (req, res) => {
  console.log('✅ Received form submission:', req.body);
  res.json({ status: 'Received', received: req.body });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is listening on port ${PORT}`);
});
