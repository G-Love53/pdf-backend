const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

const upload = multer();

app.post('/submit', upload.none(), (req, res) => {
  console.log("✅ Form received:", req.body);
  res.json({ status: "Received", received: req.body });
});

app.get("/", (req, res) => {
  res.send("🟢 Backend is running.");
});

app.use((req, res) => {
  res.status(404).send("Not Found");
});

app.listen(port, () => {
  console.log(`🚀 PDF backend listening on port ${port}`);
});
