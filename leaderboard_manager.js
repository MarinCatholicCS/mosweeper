function LeaderboardManager(scriptUrl) {
    this.scriptUrl = scriptUrl;
    this.recentSubmissions = {}; // Track recent submissions by name
}

// Client-side validation
LeaderboardManager.prototype.validateSubmission = function (name, time) {
    // Validate name
    if (!name || name.length < 1) {
        return { valid: false, message: 'Please enter your name!' };
    }
    if (name.length > 20) {
        return { valid: false, message: 'Name too long (max 20 characters)' };
    }

    // Validate time
    if (time < 0.5 || time > 9999) {
        return { valid: false, message: 'Invalid time' };
    }

    // Check rate limiting (3 submissions per 5 minutes)
    var now = Date.now();
    var fiveMinutesAgo = now - (5 * 60 * 1000);

    if (!this.recentSubmissions[name]) {
        this.recentSubmissions[name] = [];
    }

    // Clean old submissions
    this.recentSubmissions[name] = this.recentSubmissions[name].filter(function (timestamp) {
        return timestamp > fiveMinutesAgo;
    });

    if (this.recentSubmissions[name].length >= 3) {
        return { valid: false, message: 'Too many submissions. Please wait a few minutes.' };
    }

    return { valid: true };
};

// Submit a score to the leaderboard
LeaderboardManager.prototype.submitScore = function (name, time, now, startTime, timeStamps, mines, callback) {
    var self = this;

    // Validate before submitting
    var validation = this.validateSubmission(name, time);
    if (!validation.valid) {
        setTimeout(function () {
            if (callback) callback(new Error(validation.message), null);
        }, 0);
        return;
    }

    // Track this submission
    if (!this.recentSubmissions[name]) {
        this.recentSubmissions[name] = [];
    }
    this.recentSubmissions[name].push(Date.now());

    fetch(this.scriptUrl, {
        method: 'POST',
        mode: 'no-cors', // Required for Google Apps Script
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: name,
            time: time,
            timestamp: now,
            startTime,
            timeStamps,
            mines
        })

    })
        .then(function () {
            // no-cors means we can't read the response
            // If it doesn't throw an error, we assume it worked
            if (callback) callback(null, { status: 'success' });
        })
        .catch(function (error) {
            if (callback) callback(error, null);
        });
};

// Get the leaderboard
LeaderboardManager.prototype.getLeaderboard = function (callback) {

    fetch(this.scriptUrl)

        .then(function (response) {

            return response.json();
        })
        .then(function (data) {
            if (callback) callback(null, data.leaderboard || data.scores || []);
        })
        .catch(function (error) {
            if (callback) callback(error, null);
        });
};

// Show leaderboard modal when game ends
LeaderboardManager.prototype.showGameOverModal = function (won, finalTime, now, startTime, timeStamps, mines) {
    var self = this;

    var container = document.querySelector('.container');
    if (!container) {
        container = document.body;
    }

    // Create modal HTML
    var modalHTML = `
    <div class="leaderboard-overlay">
      <div class="leaderboard-modal leaderboard-modal-simple">
        <h2>${won ? 'Victory! 🎉' : 'Mo has bombed 💥'}</h2>
        ${won ? `
          <p class="final-score">Your Time: <strong>${finalTime.toFixed(2)}s</strong></p>
          <div class="submit-score-section">
            <h3>Submit to Leaderboard</h3>
            <input type="text" id="player-name" placeholder="Enter your name" maxlength="20" />
            <button id="submit-score-btn">Submit Score</button>
            <p class="submit-message" id="submit-message"></p>
          </div>
        ` : `
          <p class="final-score">Better luck next time!</p>
        `}
        <button class="close-modal-btn" id="close-leaderboard">Close</button>
      </div>
    </div>
  `;

    // Add modal to page
    var modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    container.appendChild(modalContainer);

    if (won) {
        // Prevent game controls when typing
        var nameInput = document.getElementById('player-name');
        nameInput.addEventListener('keydown', function (e) {
            e.stopPropagation();
        });

        nameInput.addEventListener('keyup', function (e) {
            e.stopPropagation();
        });

        // Submit on Enter key
        nameInput.addEventListener('keypress', function (e) {
            e.stopPropagation();
            if (e.key === 'Enter') {
                document.getElementById('submit-score-btn').click();
            }
        });

        // Submit score button
        var submitBtn = document.getElementById('submit-score-btn');
        var hasSubmitted = false;

        submitBtn.addEventListener('click', function () {
            if (hasSubmitted) return; // Prevent double submission

            var name = document.getElementById('player-name').value.trim();
            var messageEl = document.getElementById('submit-message');

            if (!name) {
                messageEl.textContent = 'Please enter your name!';
                messageEl.style.color = '#c94a3a';
                return;
            }

            messageEl.textContent = 'Submitting...';
            messageEl.style.color = '#6b4e31';
            submitBtn.disabled = true;

            self.submitScore(name, finalTime, now, startTime, timeStamps, mines, function (error, result) {
                if (error) {
                    messageEl.textContent = 'Failed: ' + error.message;
                    messageEl.style.color = '#c94a3a';
                    submitBtn.disabled = false;
                } else {
                    hasSubmitted = true;
                    messageEl.textContent = 'Score submitted successfully!';
                    messageEl.style.color = '#a5e36f';

                    // Reload permanent leaderboard
                    setTimeout(function () {
                        self.updatePermanentLeaderboard();
                    }, 1000);

                    // Disable input and button
                    document.getElementById('player-name').disabled = true;
                    submitBtn.disabled = true;
                }
            });
        });

        // Focus on name input
        nameInput.focus();
    }

    // Close button
    document.getElementById('close-leaderboard').addEventListener('click', function () {
        modalContainer.remove();
    });
};

// Create permanent leaderboard display at bottom of page
LeaderboardManager.prototype.createPermanentLeaderboard = function () {
    var self = this;
    // Create permanent leaderboard HTML
    var leaderboardHTML = `
    <div class="permanent-leaderboard">
      <h3>🏆 Top 10 Leaderboard</h3>
      <div id="permanent-leaderboard-list">Loading...</div>
      <div class="leaderboard-buttons">
        <button id="refresh-leaderboard" class="refresh-btn">Refresh</button>
      </div>
    </div>
  `;

    // Find the container and add to it
    var container = document.querySelector('.container');
    if (!container) {
        container = document.body;
    }

    var leaderboardDiv = document.createElement('div');
    leaderboardDiv.innerHTML = leaderboardHTML;
    container.appendChild(leaderboardDiv);

    // Load initial leaderboard
    this.updatePermanentLeaderboard();

    // Refresh button
    document.getElementById('refresh-leaderboard').addEventListener('click', function () {
        self.updatePermanentLeaderboard();
    });

    // Auto-refresh every 30 seconds
    setInterval(function () {
        self.updatePermanentLeaderboard();
    }, 30000);
};

// Update the permanent leaderboard display
LeaderboardManager.prototype.updatePermanentLeaderboard = function () {
    var listEl = document.getElementById('permanent-leaderboard-list');

    this.getLeaderboard(function (error, leaderboard) {
        if (error) {
            listEl.innerHTML = '<p class="error">Failed to load</p>';
            return;
        }

        if (!leaderboard || leaderboard.length === 0) {
            listEl.innerHTML = '<p class="empty-state">No scores yet!</p>';
            return;
        }

        var html = '<ol class="permanent-leaderboard-entries">';
        leaderboard.forEach(function (entry, index) {
            var medal = '';
            if (index === 0) medal = '🥇';
            else if (index === 1) medal = '🥈';
            else if (index === 2) medal = '🥉';

            // Format the timestamp
            var formattedDate = '';
            if (entry.timestamp || entry.date) {
                var date = new Date(entry.timestamp || entry.date);
                formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            html += `
        <li>
          <span class="rank">${medal || (index + 1) + '.'}</span>
          <div class="player-info">
            <span class="player-name">${escapeHtml(entry.name)}</span>
            <span class="player-timestamp">${formattedDate}</span>
          </div>
          <span class="player-score">${entry.time.toFixed(2)}s</span>
        </li>
      `;
        });
        html += '</ol>';

        listEl.innerHTML = html;
    });
};

// Escape HTML helper
function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}