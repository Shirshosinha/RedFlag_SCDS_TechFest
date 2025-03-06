// community.js
document.addEventListener('DOMContentLoaded', function() {
  const commentInput = document.getElementById('comment-input');
  const sourceInput = document.getElementById('source-input');
  const submitButton = document.getElementById('submit-comment');
  const commentsContainer = document.getElementById('comments-container');
  const commentCount = document.getElementById('comment-count');
  const emptyState = document.getElementById('empty-state');
  const commentsLoader = document.getElementById('comments-loader');
  const sentimentMeter = document.getElementById('sentiment-meter');
  const sentimentStats = document.getElementById('sentiment-stats');
  const commentSummary = document.getElementById('comment-summary');
  
  let currentUrl = '';
  
  // Get current tab URL
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0]) {
      currentUrl = tabs[0].url;
      loadComments(currentUrl);
      loadCommentStats(currentUrl);
    }
  });
  
  // Initialize sentiment meter
  const ctx = sentimentMeter.getContext('2d');
  sentimentMeter.width = 120;
  sentimentMeter.height = 120;
  
  // Handle comment submission
  submitButton.addEventListener('click', function() {
    const commentText = commentInput.value.trim();
    const sourceLink = sourceInput.value.trim();
    
    if (commentText === '') {
      alert('Please enter a comment');
      return;
    }
    
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
    
    // Add comment to the backend
    fetch('http://127.0.0.1:8000/add_comment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        website_url: currentUrl,
        comment_text: commentText,
        source_link: sourceLink
      })
    })
    .then(response => response.json())
    .then(data => {
      console.log('Success:', data);
      // Clear inputs
      commentInput.value = '';
      sourceInput.value = '';
      
      // Reload comments
      loadComments(currentUrl);
      
      // Reload stats after a short delay
      setTimeout(() => {
        loadCommentStats(currentUrl);
      }, 1000);
      
      submitButton.disabled = false;
      submitButton.textContent = 'Submit';
    })
    .catch(error => {
      console.error('Error:', error);
      alert('Failed to submit comment. Please try again.');
      submitButton.disabled = false;
      submitButton.textContent = 'Submit';
    });
  });
  
  function loadComments(url) {
    showLoader(true);
    
    fetch(`http://127.0.0.1:8000/get_comments?website_url=${encodeURIComponent(url)}`)
      .then(response => response.json())
      .then(data => {
        showLoader(false);
        renderComments(data.comments);
      })
      .catch(error => {
        console.error('Error fetching comments:', error);
        showLoader(false);
        commentsContainer.innerHTML = '<div class="empty-state">Failed to load comments. Please try again later.</div>';
      });
  }
  
  function loadCommentStats(url) {
    if (!url) return;
    
    fetch(`http://127.0.0.1:8000/get_comment_stats?website_url=${encodeURIComponent(url)}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server responded with status ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.sentiment_stats) {
          renderSentimentMeter(data.sentiment_stats);
        } else {
          console.warn("No sentiment data available.");
        }
  
        if (data.comment_summary) {
          renderSummary(data.comment_summary);
        } else {
          document.getElementById("comment-summary").textContent = "No summary available.";
        }
      })
      .catch(error => {
        console.error("Error fetching stats:", error);
        document.getElementById("comment-summary").textContent = "Failed to load community summary.";
      });
  }
  
  function renderComments(comments) {
    if (!comments || comments.length === 0) {
      emptyState.style.display = 'block';
      commentCount.textContent = '0';
      return;
    }
    
    emptyState.style.display = 'none';
    commentCount.textContent = comments.length;
    
    commentsContainer.innerHTML = '';
    
    comments.forEach(comment => {
      const commentElement = document.createElement('div');
      commentElement.className = 'comment-item';
      
      const commentTextElement = document.createElement('div');
      commentTextElement.className = 'comment-text';
      commentTextElement.textContent = comment.comment_text;
      commentElement.appendChild(commentTextElement);
      
      if (comment.source_link) {
        const sourceElement = document.createElement('a');
        sourceElement.className = 'comment-source';
        sourceElement.href = comment.source_link;
        sourceElement.target = '_blank';
        sourceElement.textContent = 'Source';
        commentElement.appendChild(sourceElement);
      }
      
      commentsContainer.appendChild(commentElement);
    });
  }
  
  function renderSentimentMeter(sentimentData) {
    // Clear previous stats
    sentimentStats.innerHTML = '';
    
    // Draw the meter
    const centerX = sentimentMeter.width / 2;
    const centerY = sentimentMeter.height / 2;
    const radius = 45;
    
    // Clear canvas
    ctx.clearRect(0, 0, sentimentMeter.width, sentimentMeter.height);
    
    // Draw background arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, 0, false);
    ctx.lineWidth = 15;
    ctx.strokeStyle = '#f1f1f1';
    ctx.stroke();
    
    // Get percentages and sort by sentiment
    let positive = 0;
    let neutral = 0;
    let negative = 0;
    
    sentimentData.forEach(item => {
      // Clean up the sentiment value by removing extra quotes
      const cleanSentiment = item.sentiment.replace(/"/g, '');
      
      if (cleanSentiment === 'positive') {
        positive = item.percentage;
      } else if (cleanSentiment === 'neutral') {
        neutral = item.percentage;
      } else if (cleanSentiment === 'negative') {
        negative = item.percentage;
      }
    });
    
    console.log(`Sentiment data processed: positive=${positive}, neutral=${neutral}, negative=${negative}`);
    
    // Draw arcs for each sentiment
    let startAngle = Math.PI;
    
    // Draw negative sentiment (left side)
    if (negative > 0) {
      const negativeAngle = Math.PI * (negative / 100);
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + negativeAngle, false);
      ctx.lineWidth = 15;
      ctx.strokeStyle = '#F44336';
      ctx.stroke();
      startAngle += negativeAngle;
    }
    
    // Draw neutral sentiment (middle)
    if (neutral > 0) {
      const neutralAngle = Math.PI * (neutral / 100);
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + neutralAngle, false);
      ctx.lineWidth = 15;
      ctx.strokeStyle = '#FFC107';
      ctx.stroke();
      startAngle += neutralAngle;
    }
    
    // Draw positive sentiment (right side)
    if (positive > 0) {
      const positiveAngle = Math.PI * (positive / 100);
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + positiveAngle, false);
      ctx.lineWidth = 15;
      ctx.strokeStyle = '#4CAF50';
      ctx.stroke();
    }
    
    // Add text in center
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.fillText('Sentiment', centerX, centerY + 4);
    
    // Add stats to list
    if (positive > 0) {
      addStatItem('positive', Math.round(positive) + '% Positive');
    }
    if (neutral > 0) {
      addStatItem('neutral', Math.round(neutral) + '% Neutral');
    }
    if (negative > 0) {
      addStatItem('negative', Math.round(negative) + '% Negative');
    }
  }
  
  function addStatItem(type, text) {
    const statItem = document.createElement('div');
    statItem.className = 'stat-item';
    
    const statColor = document.createElement('div');
    statColor.className = `stat-color stat-${type}`;
    statItem.appendChild(statColor);
    
    const statText = document.createElement('div');
    statText.textContent = text;
    statItem.appendChild(statText);
    
    sentimentStats.appendChild(statItem);
  }
  
  function renderSummary(summary) {
    commentSummary.textContent = summary;
  }
  
  function showLoader(show) {
    commentsLoader.style.display = show ? 'block' : 'none';
  }
});