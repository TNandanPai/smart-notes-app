const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(express.static("public", { index: false }));

// Root → Login page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

function readData() {
  return JSON.parse(fs.readFileSync("data.json"));
}

function writeData(data) {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

/* ================= AUTH ================= */

// Signup
app.post("/signup", (req, res) => {
  const { username, password } = req.body;
  const data = readData();

  if (data.users.find(u => u.username === username)) {
    return res.status(400).json({ message: "User already exists" });
  }

  data.users.push({ username, password });
  writeData(data);

  res.json({ message: "Signup successful" });
});

// Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const data = readData();

  const user = data.users.find(
    u => u.username === username && u.password === password
  );

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  res.json({ message: "Login successful" });
});

/* ================= NOTES ================= */

// Get Notes
app.get("/notes", (req, res) => {
  const data = readData();
  res.json(data.notes);
});

// Add Note (Agentic AI Vibe Enhancer)
app.post("/notes", (req, res) => {
  const data = readData();
  let text = req.body.text;
  
  // Vibe AI: Auto-append emojis based on text keywords for aesthetic
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes("meeting") || lowerText.includes("interview") || lowerText.includes("call")) text += " 🤝";
  else if (lowerText.includes("study") || lowerText.includes("exam") || lowerText.includes("learn")) text += " 📚";
  else if (lowerText.includes("code") || lowerText.includes("bug") || lowerText.includes("dev")) text += " 💻";
  else if (lowerText.includes("gym") || lowerText.includes("workout") || lowerText.includes("fit")) text += " 🏋️‍♂️";
  else if (lowerText.includes("buy") || lowerText.includes("shop") || lowerText.includes("grocery")) text += " 🛒";
  else if (lowerText.includes("coffee") || lowerText.includes("tea") || lowerText.includes("snack")) text += " ☕";
  else if (lowerText.includes("idea") || lowerText.includes("think") || lowerText.includes("brainstorm")) text += " 💡";
  else text += " ✨"; // default vibe

  data.notes.push({
    id: Date.now(),
    text: text,
    category: req.body.category || "Personal",
    priority: req.body.priority || "Medium",
    dueDate: req.body.dueDate || null,
    date: new Date().toLocaleString(),
    important: req.body.isImportant || false,
    completed: false
  });

  writeData(data);
  res.json({ message: "Note added" });
});

// Delete Note
app.delete("/notes/:id", (req, res) => {
  const data = readData();
  data.notes = data.notes.filter(n => n.id != req.params.id);
  writeData(data);
  res.json({ message: "Deleted" });
});

// Update Notes
app.post("/notes/update", (req, res) => {
  const data = readData();
  data.notes = req.body;
  writeData(data);
  res.json({ message: "Updated" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});