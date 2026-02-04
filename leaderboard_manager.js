function LeaderboardManager(scriptUrl) {
    this.scriptUrl = scriptUrl;
    this.recentSubmissions = {}; // Track recent submissions by name
    this.currentView = 'daily'; // 'daily' or 'alltime'
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

// Get the leaderboard (with optional daily filter)
LeaderboardManager.prototype.getLeaderboard = function (callback, dailyOnly) {
    fetch(this.scriptUrl + (dailyOnly ? '?daily=true' : ''))
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

// Get daily leaderboard specifically
LeaderboardManager.prototype.getDailyLeaderboard = function (callback) {
    this.getLeaderboard(callback, true);
};

// Get all-time leaderboard specifically
LeaderboardManager.prototype.getAllTimeLeaderboard = function (callback) {
    this.getLeaderboard(callback, false);
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
      <h3>🏆 Leaderboard</h3>
      <div class="leaderboard-tabs">
        <button class="tab-btn active" data-view="daily">Today</button>
        <button class="tab-btn" data-view="alltime">All-Time</button>
      </div>
      <div id="permanent-leaderboard-list">Loading...</div>
      <div class="leaderboard-buttons">
        <button id="refresh-leaderboard" class="refresh-btn">Refresh</button>
        <button id="view-all-scores" class="view-all-btn">View All Scores</button>
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

    // Tab switching
    var tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            // Update active state
            tabButtons.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');

            // Switch view
            self.currentView = btn.dataset.view;

            // Show loading state
            var listEl = document.getElementById('permanent-leaderboard-list');
            listEl.innerHTML = '<p class="loading-state">Loading...</p>';

            self.updatePermanentLeaderboard();
        });
    });

    // Refresh button
    document.getElementById('refresh-leaderboard').addEventListener('click', function () {
        var listEl = document.getElementById('permanent-leaderboard-list');
        listEl.innerHTML = '<p class="loading-state">Loading...</p>';
        self.updatePermanentLeaderboard();
    });

    // View All Scores button
    document.getElementById('view-all-scores').addEventListener('click', function () {
        self.showAllScoresModal();
    });

    // Auto-refresh every 30 seconds
    setInterval(function () {
        self.updatePermanentLeaderboard();
    }, 30000);

    // Check for midnight to refresh daily leaderboard
    this.startMidnightCheck();
};

// Check for midnight and refresh daily leaderboard
LeaderboardManager.prototype.startMidnightCheck = function () {
    var self = this;
    var lastDate = new Date().toDateString();

    setInterval(function () {
        var currentDate = new Date().toDateString();
        if (currentDate !== lastDate) {
            lastDate = currentDate;
            if (self.currentView === 'daily') {
                self.updatePermanentLeaderboard();
            }
        }
    }, 60000); // Check every minute
};

// Update the permanent leaderboard display
LeaderboardManager.prototype.updatePermanentLeaderboard = function () {
    var self = this;
    var listEl = document.getElementById('permanent-leaderboard-list');

    var isDailyView = this.currentView === 'daily';

    this.getLeaderboard(function (error, leaderboard) {
        if (error) {
            listEl.innerHTML = '<p class="error">Failed to load</p>';
            return;
        }

        // Filter for daily if needed
        if (isDailyView) {
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            var todayTimestamp = today.getTime();

            leaderboard = leaderboard.filter(function (entry) {
                var entryDate = new Date(entry.timestamp || entry.date);
                entryDate.setHours(0, 0, 0, 0);
                return entryDate.getTime() === todayTimestamp;
            });
        }

        if (!leaderboard || leaderboard.length === 0) {
            listEl.innerHTML = '<p class="empty-state">' + (isDailyView ? 'No scores today yet!' : 'No scores yet!') + '</p>';
            return;
        }

        var html = '<ol class="permanent-leaderboard-entries">';
        var displayCount = Math.min(leaderboard.length, 10);

        for (var i = 0; i < displayCount; i++) {
            var entry = leaderboard[i];
            var medal = '';
            if (i === 0) medal = '🥇';
            else if (i === 1) medal = '🥈';
            else if (i === 2) medal = '🥉';

            // Format the timestamp
            var formattedDate = '';
            if (entry.timestamp || entry.date) {
                var date = new Date(entry.timestamp || entry.date);
                formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            html += `
        <li>
          <span class="rank">${medal || (i + 1) + '.'}</span>
          <div class="player-info">
            <span class="player-name">${escapeHtml(entry.name)}</span>
            <span class="player-timestamp">${formattedDate}</span>
          </div>
          <span class="player-score">${entry.time.toFixed(2)}s</span>
        </li>
      `;
        }
        html += '</ol>';

        listEl.innerHTML = html;
    }, isDailyView);
};

// Show modal with all scores (best per player) with pagination
LeaderboardManager.prototype.showAllScoresModal = function () {
    var self = this;

    var container = document.querySelector('.container');
    if (!container) {
        container = document.body;
    }

    // Create modal HTML
    var modalHTML = `
    <div class="leaderboard-overlay">
      <div class="leaderboard-modal all-scores-modal">
        <h2>All Scores 📊</h2>
        <div id="all-scores-list">Loading...</div>
        <div class="pagination-controls" id="pagination-controls" style="display: none;">
          <button class="page-btn" id="prev-page">← Previous</button>
          <span class="page-info" id="page-info">Page 1</span>
          <button class="page-btn" id="next-page">Next →</button>
        </div>
        <button class="close-modal-btn" id="close-all-scores">Close</button>
      </div>
    </div>
  `;

    // Add modal to page
    var modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    container.appendChild(modalContainer);

    var currentPage = 1;
    var scoresPerPage = 20;
    var allScores = [];

    function renderPage(page) {
        var listEl = document.getElementById('all-scores-list');
        var paginationControls = document.getElementById('pagination-controls');

        var totalPages = Math.ceil(allScores.length / scoresPerPage);
        var startIndex = (page - 1) * scoresPerPage;
        var endIndex = Math.min(startIndex + scoresPerPage, allScores.length);
        var pageScores = allScores.slice(startIndex, endIndex);

        var html = '<div class="all-scores-container">';
        html += '<ol class="all-scores-entries" start="' + (startIndex + 1) + '">';

        pageScores.forEach(function (entry, index) {
            var globalIndex = startIndex + index;
            var medal = '';
            if (globalIndex === 0) medal = '🥇';
            else if (globalIndex === 1) medal = '🥈';
            else if (globalIndex === 2) medal = '🥉';

            // Format the timestamp
            var formattedDate = '';
            if (entry.timestamp || entry.date) {
                var date = new Date(entry.timestamp || entry.date);
                formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            html += `
      <li>
        <span class="rank">${medal || (globalIndex + 1) + '.'}</span>
        <div class="player-info">
          <span class="player-name">${escapeHtml(entry.name)}</span>
          <span class="player-timestamp">${formattedDate}</span>
        </div>
        <span class="player-score">${entry.time.toFixed(2)}s</span>
      </li>
    `;
        });

        html += '</ol></div>';
        listEl.innerHTML = html;

        // Update pagination controls
        if (totalPages > 1) {
            paginationControls.style.display = 'flex';
            document.getElementById('page-info').textContent = 'Page ' + page + ' of ' + totalPages;
            document.getElementById('prev-page').disabled = page === 1;
            document.getElementById('next-page').disabled = page === totalPages;
        } else {
            paginationControls.style.display = 'none';
        }
    }

    // Load all scores (fetch with ?all=true to get everything, then group by player client-side)
    fetch(this.scriptUrl + '?allScores=true')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            var rawScores = data.scores || [];

            if (!rawScores || rawScores.length === 0) {
                document.getElementById('all-scores-list').innerHTML = '<p class="empty-state">No scores yet!</p>';
                return;
            }

            // Group by name and keep only best (lowest) time for each player
            var bestScoresByPlayer = {};
            rawScores.forEach(function (score) {
                var normalizedName = score.name.toLowerCase().trim();

                if (!bestScoresByPlayer[normalizedName] || score.time < bestScoresByPlayer[normalizedName].time) {
                    bestScoresByPlayer[normalizedName] = {
                        name: score.name, // Keep original capitalization
                        time: score.time,
                        timestamp: score.timestamp || score.date
                    };
                }
            });

            // Convert to array and sort by time (best first)
            allScores = Object.values(bestScoresByPlayer).sort(function (a, b) {
                return a.time - b.time;
            });

            renderPage(currentPage);

            // Pagination button handlers
            document.getElementById('prev-page').addEventListener('click', function () {
                if (currentPage > 1) {
                    currentPage--;
                    renderPage(currentPage);
                }
            });

            document.getElementById('next-page').addEventListener('click', function () {
                var totalPages = Math.ceil(allScores.length / scoresPerPage);
                if (currentPage < totalPages) {
                    currentPage++;
                    renderPage(currentPage);
                }
            });
        })
        .catch(function (error) {
            document.getElementById('all-scores-list').innerHTML = '<p class="error">Failed to load scores</p>';
        });

    // Close button
    document.getElementById('close-all-scores').addEventListener('click', function () {
        modalContainer.remove();
    });
};

// Escape HTML helper
function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}