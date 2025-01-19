const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (if any) from the root directory
app.use(express.static(path.join(__dirname)));

// Add a route to handle '/todos/:id'

// Serve the 'elmn.js' file when accessing '/elmn.js'
app.get("/elmn.js", (req, res) => {
  res.sendFile(path.join(__dirname, "elmn.js"));
});

// Catch all routes and serve 'index.html'
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
