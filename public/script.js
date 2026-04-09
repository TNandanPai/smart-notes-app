  // Protect Dashboard
  if (window.location.pathname.includes("index.html")) {
    const user = localStorage.getItem("loggedInUser");
    if (!user) {
      window.location.href = "/";
    }
  }

  let allNotes = [];

  /* ================= SECRET CODE AUTH ================= */

  // Simple secret code authentication with device binding and rate limiting
  function generateDeviceFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('DeviceID', 2, 2);

    const deviceId = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvas: canvas.toDataURL(),
      cookiesEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack
    };

    return btoa(JSON.stringify(deviceId));
  }

  function isRateLimited(username) {
    const lockoutKey = `lockout_${username}`;
    const lockoutTime = localStorage.getItem(lockoutKey);

    if (lockoutTime) {
      const lockoutEnd = parseInt(lockoutTime);
      const now = Date.now();

      if (now < lockoutEnd) {
        const remainingHours = Math.ceil((lockoutEnd - now) / (1000 * 60 * 60));
        showToast(`Account locked. Try again in ${remainingHours} hour(s).`, "error");
        return true;
      } else {
        // Lockout period expired, remove it
        localStorage.removeItem(lockoutKey);
        localStorage.removeItem(`failed_attempts_${username}`);
      }
    }
    return false;
  }

  function recordFailedAttempt(username) {
    const attemptsKey = `failed_attempts_${username}`;
    const attempts = parseInt(localStorage.getItem(attemptsKey) || '0') + 1;
    localStorage.setItem(attemptsKey, attempts.toString());

    // Lock account for 24 hours after 3 failed attempts
    if (attempts >= 3) {
      const lockoutEnd = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
      localStorage.setItem(`lockout_${username}`, lockoutEnd.toString());
      localStorage.removeItem(attemptsKey);
      showToast("Too many failed attempts. Account locked for 24 hours.", "error");
    } else {
      showToast(`Invalid secret code. ${3 - attempts} attempt(s) remaining.`, "error");
    }
  }

  function validateSecretCode(secretCode) {
    if (!secretCode || secretCode.length < 8) {
      return "Secret code must be at least 8 characters long";
    }

    // Check for required character types
    const hasLetter = /[a-zA-Z]/.test(secretCode);
    const hasNumber = /\d/.test(secretCode);
    const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(secretCode);

    if (!hasLetter) {
      return "Secret code must contain at least one letter";
    }
    if (!hasNumber) {
      return "Secret code must contain at least one number";
    }
    if (!hasSymbol) {
      return "Secret code must contain at least one symbol (!@#$%^&* etc.)";
    }

    return null; // Valid
  }

  function showSecretCodeModal(title, onSubmit) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box secret-code-modal">
        <h3>${title}</h3>
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; color: var(--text-main); font-weight: 500;">
            Username:
          </label>
          <input type="text" id="secretUsername" placeholder="Enter username" style="width: 100%; margin-bottom: 15px;">
        </div>
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; color: var(--text-main); font-weight: 500;">
            Secret Code:
          </label>
          <input type="password" id="secretCode" placeholder="Enter secret code" style="width: 100%;">
          <small style="color: var(--text-muted); font-size: 12px; margin-top: 5px; display: block;">
            Must be 8+ characters with letters, numbers & symbols
          </small>
        </div>
        <div class="modal-actions">
          <button class="modal-btn-cancel" id="secretCancel">Cancel</button>
          <button class="modal-btn-confirm" id="secretSubmit">Submit</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const usernameInput = document.getElementById('secretUsername');
    const secretCodeInput = document.getElementById('secretCode');

    document.getElementById('secretCancel').onclick = () => overlay.remove();
    document.getElementById('secretSubmit').onclick = () => {
      const username = usernameInput.value.trim();
      const secretCode = secretCodeInput.value;
      overlay.remove();
      onSubmit(username, secretCode);
    };

    // Focus on username first
    setTimeout(() => usernameInput.focus(), 100);

    // Enter key support
    secretCodeInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        document.getElementById('secretSubmit').click();
      }
    };
  }

  async function registerSecretCode() {
    showSecretCodeModal("Register Secret Code", (username, secretCode) => {
      if (!username) {
        showToast("Please enter a username", "error");
        return;
      }

      if (!secretCode) {
        showToast("Please enter a secret code", "error");
        return;
      }

      const validationError = validateSecretCode(secretCode);
      if (validationError) {
        showToast(validationError, "error");
        return;
      }

      const deviceId = generateDeviceFingerprint();
      const authData = {
        secretCode: btoa(secretCode),
        deviceId: deviceId,
        createdAt: Date.now()
      };

      localStorage.setItem(`secret_auth_${username}`, JSON.stringify(authData));
      showToast("Secret code registered! Use it to login from this device.", "success");
    });
  }

  async function loginWithSecretCode() {
    showSecretCodeModal("Login with Secret Code", (username, secretCode) => {
      if (!username) {
        showToast("Please enter a username", "error");
        return;
      }

      // Check if account is rate limited
      if (isRateLimited(username)) {
        return;
      }

      if (!secretCode) {
        showToast("Please enter your secret code", "error");
        return;
      }

      const storedAuth = localStorage.getItem(`secret_auth_${username}`);
      if (!storedAuth) {
        showToast("No secret code registered for this user", "error");
        return;
      }

      try {
        const authData = JSON.parse(storedAuth);
        const currentDeviceId = generateDeviceFingerprint();

        // Verify secret code and device
        if (btoa(secretCode) === authData.secretCode && currentDeviceId === authData.deviceId) {
          // Successful login - reset failed attempts
          localStorage.removeItem(`failed_attempts_${username}`);
          localStorage.setItem("loggedInUser", username);
          showToast("Secret code login successful!", "success");
          setTimeout(() => window.location.href = "index.html", 1000);
        } else {
          recordFailedAttempt(username);
        }
      } catch (error) {
        showToast("Authentication error. Please try again.", "error");
      }
    });
  }

  /* ================= UI COMPONENTS ================= */

  function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `custom-toast ${type}`;
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  function showConfirm(message) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-box">
          <h3>Are you sure?</h3>
          <p style="color:var(--text-muted); margin-bottom:25px;">${message}</p>
          <div class="modal-actions">
            <button class="modal-btn-cancel" id="confirmCancel">Cancel</button>
            <button class="modal-btn-danger" id="confirmOk">Delete</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      
      document.getElementById('confirmCancel').onclick = () => { overlay.remove(); resolve(false); };
      document.getElementById('confirmOk').onclick = () => { overlay.remove(); resolve(true); };
    });
  }

  function showPrompt(title, defaultValue) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-box">
          <h3>${title}</h3>
          <input type="text" id="promptInput" value="${defaultValue}" style="background:#ffffff; border:1px solid #cbd5e1; color:#1a202c; padding:12px; border-radius:12px; width: 100%; box-sizing: border-box;">
          <div class="modal-actions">
            <button class="modal-btn-cancel" id="promptCancel">Cancel</button>
            <button class="modal-btn-confirm" id="promptOk">Save</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      
      const input = document.getElementById('promptInput');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      
      document.getElementById('promptCancel').onclick = () => { overlay.remove(); resolve(null); };
      document.getElementById('promptOk').onclick = () => { overlay.remove(); resolve(input.value); };
      input.onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('promptOk').click(); };
    });
  }

  /* ================= LOAD NOTES ================= */

  async function loadNotes() {
    const res = await fetch("/notes");
    const notes = await res.json();
    allNotes = notes;
    
    // Reset filter and search when loading notes
    document.getElementById("filterSelect").value = "All";
    document.getElementById("searchInput").value = "";
    
    displayNotes(notes);
  }

  /* ================= DISPLAY NOTES ================= */

  function displayNotes(notes) {
    const list = document.getElementById("notesList");
    if (!list) return;

    list.innerHTML = "";

    if (notes.length === 0) {
      list.innerHTML = `<div class="empty-state">No notes found for this filter 🚀</div>`;
      return;
    }

    // Calculate statistics with backward compatibility
    const totalNotes = allNotes.length;
    const completedNotes = allNotes.filter(n => n.completed === true).length;
    const overdueNotes = allNotes.filter(n => n.dueDate && new Date(n.dueDate) < new Date() && !(n.completed === true)).length;
    const highPriorityNotes = allNotes.filter(n => (n.priority || 'Medium') === 'High').length;

    document.getElementById("totalNotes").textContent = totalNotes;
    document.getElementById("completedNotes").textContent = completedNotes;
    document.getElementById("overdueNotes").textContent = overdueNotes;
    document.getElementById("highPriorityNotes").textContent = highPriorityNotes;

    notes.forEach(n => {
      // Provide defaults for backward compatibility
      const priority = n.priority || 'Medium';
      const completed = n.completed || false;
      const dueDate = n.dueDate;
      
      const isOverdue = dueDate && new Date(dueDate) < new Date() && !completed;
      const isDueSoon = dueDate && !isOverdue && new Date(dueDate) <= new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      list.innerHTML += `
        <div class="note-card ${n.category} ${n.important ? 'important-note' : ''} ${isOverdue ? 'overdue-note' : ''} ${isDueSoon ? 'due-soon-note' : ''} ${completed ? 'completed-note' : ''}">
          <div class="card-content">
            <h4>${n.text}</h4>
            <div class="note-meta">
              <div class="note-tags">
                <span class="category-tag"><i class="fa-solid fa-tag"></i> ${n.category}</span>
                <span class="priority-tag priority-${priority.toLowerCase()}"><i class="fa-solid fa-flag"></i> ${priority}</span>
                ${n.important ? '<span class="important-tag"><i class="fa-solid fa-triangle-exclamation"></i> Important</span>' : ''}
                ${isOverdue ? '<span class="overdue-tag"><i class="fa-solid fa-clock"></i> Overdue</span>' : ''}
                ${isDueSoon ? '<span class="due-soon-tag"><i class="fa-solid fa-bell"></i> Due Soon</span>' : ''}
                ${completed ? '<span class="completed-tag"><i class="fa-solid fa-check-circle"></i> Completed</span>' : ''}
              </div>
              <div class="note-info">
                ${dueDate ? `<span class="due-date"><i class="fa-regular fa-calendar"></i> ${new Date(dueDate).toLocaleDateString()}</span>` : ''}
                <span class="note-date"><i class="fa-regular fa-clock"></i> ${n.date}</span>
              </div>
            </div>
          </div>
          <div class="actions">
            <button class="edit-btn" onclick="editNote(${n.id}, \`${n.text}\`)" title="Edit">
              <i class="fa-solid fa-pencil"></i>
            </button>
            <button onclick="toggleComplete(${n.id})" title="${completed ? 'Mark Incomplete' : 'Mark Complete'}" class="complete-btn ${completed ? 'completed' : ''}">
              <i class="fa-solid ${completed ? 'fa-undo' : 'fa-check'}"></i>
            </button>
            <button onclick="deleteNote(${n.id})" title="Delete">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
      `;
    });
  }

  /* ================= SEARCH ================= */

  function searchNotes() {
    const keyword = document.getElementById("searchInput").value.toLowerCase();

    const filtered = allNotes.filter(n =>
      n.text.toLowerCase().includes(keyword)
    );

    displayNotes(filtered);
  }

  /* ================= FILTER ================= */

  function filterNotes() {
    const selected = document.getElementById("filterSelect").value;

    // Clear search when filtering
    document.getElementById("searchInput").value = "";

    let filtered;
    if (selected === "All") {
      filtered = allNotes;
    } else if (selected === "Completed") {
      filtered = allNotes.filter(n => n.completed === true);
    } else if (selected === "Pending") {
      filtered = allNotes.filter(n => !(n.completed === true));
    } else {
      filtered = allNotes.filter(n => n.category === selected);
    }

    displayNotes(filtered);
  }

  /* ================= ADD NOTE (Agentic AI) ================= */

  async function addNote() {
    const text = document.getElementById("noteInput").value.trim();
    let category = document.getElementById("categorySelect").value;
    const priority = document.getElementById("prioritySelect").value;
    const dueDate = document.getElementById("dueDateInput").value;

    if (!text) return;

    const lowerText = text.toLowerCase();

    // Auto Category Detection
    if (lowerText.includes("meeting") || lowerText.includes("project") || lowerText.includes("office")) {
      category = "Work";
    } 
    else if (lowerText.includes("exam") || lowerText.includes("study") || lowerText.includes("assignment")) {
      category = "Study";
    } 
    else if (lowerText.includes("family") || lowerText.includes("birthday") || lowerText.includes("personal")) {
      category = "Personal";
    }

    // Important Detection (now based on priority)
    let isImportant = priority === "High";

    await fetch("/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, category, priority, dueDate, isImportant })
    });

    document.getElementById("noteInput").value = "";
    document.getElementById("dueDateInput").value = "";
    loadNotes();
  }

  /* ================= DELETE ================= */

  async function deleteNote(id) {
    const confirmed = await showConfirm("Delete this note?");
    if (!confirmed) return;

    await fetch(`/notes/${id}`, { method: "DELETE" });
    showToast("Note deleted successfully", "success");
    loadNotes();
  }

  /* ================= TOGGLE COMPLETE ================= */

  async function toggleComplete(id) {
    fetch("/notes")
      .then(res => res.json())
      .then(notes => {
        const updated = notes.map(n =>
          n.id === id ? { ...n, completed: !(n.completed === true) } : n
        );

        fetch("/notes/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated)
        }).then(() => {
          loadNotes();
          showToast("Note status updated!", "success");
        });
      });
  }

  async function editNote(id, currentText) {
    const newText = await showPrompt("Edit note", currentText || "");

    if (newText === null) {
      return; // user cancelled
    }

    const trimmed = newText.trim();
    if (!trimmed) {
      showToast("Note text cannot be empty", "error");
      return;
    }

    const notesRes = await fetch('/notes');
    const notes = await notesRes.json();

    const updated = notes.map(n =>
      n.id === id ? { ...n, text: trimmed } : n
    );

    await fetch('/notes/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });

    showToast('Note updated successfully', 'success');
    loadNotes();
  }

  /* ================= AUTH ================= */

  async function signup() {
    const username = document.getElementById("signupUsername").value;
    const password = document.getElementById("signupPassword").value;

    if (!username) {
      showToast("Please enter a username", "error");
      return;
    }

    // If password is empty, this is secret code signup
    if (!password) {
      showSecretCodeModal("Register Secret Code", (modalUsername, secretCode) => {
        if (!modalUsername) {
          showToast("Please enter a username", "error");
          return;
        }

        if (modalUsername !== username) {
          showToast("Username must match the one above", "error");
          return;
        }

        if (!secretCode) {
          showToast("Please enter a secret code", "error");
          return;
        }

        const validationError = validateSecretCode(secretCode);
        if (validationError) {
          showToast(validationError, "error");
          return;
        }

        const deviceId = generateDeviceFingerprint();
        const authData = {
          secretCode: btoa(secretCode),
          deviceId: deviceId,
          createdAt: Date.now()
        };

        localStorage.setItem(`secret_auth_${username}`, JSON.stringify(authData));
        localStorage.setItem("loggedInUser", username);
        showToast("Secret code account created! Welcome.", "success");
        setTimeout(() => window.location.href = "index.html", 1500);
      });
      return;
    }

    // Regular password signup
    const res = await fetch("/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (res.ok) {
      showToast("Account created successfully! Welcome.", "success");
      setTimeout(() => window.location.href = "/", 1500);
    } else {
      showToast("Username already exists", "error");
    }
  }

  async function login() {
    const username = document.getElementById("loginUsername").value;
    const password = document.getElementById("loginPassword").value;

    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (res.ok) {
      localStorage.setItem("loggedInUser", username);
      showToast("Login successful!", "success");
      setTimeout(() => window.location.href = "index.html", 1000);
    } else {
      showToast("Invalid credentials", "error");
    }
  }

  function logout() {
    localStorage.removeItem("loggedInUser");
    showToast("Logged out successfully", "success");
    setTimeout(() => window.location.href = "/", 1000);
  }

  /* ================= INIT ================= */

  if (window.location.pathname.includes("index.html")) {
    loadNotes();
  }