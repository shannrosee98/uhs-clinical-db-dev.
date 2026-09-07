const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;

// Serve everything inside the public folder
app.use(express.static(path.join(__dirname, "public")));

// Send index.html when visiting /
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`UHS Website running on port ${PORT}`);
});
