// popup.js
document.addEventListener('DOMContentLoaded', function() {
  // Toggle functionality
  const toggleCheckbox = document.getElementById('highlights-toggle');
  
  // Load current state from storage
  chrome.storage.sync.get('highlightsVisible', function(data) {
    if (data.highlightsVisible !== undefined) {
      toggleCheckbox.checked = data.highlightsVisible;
    }
  });
  
  // Listen for changes to the toggle
  toggleCheckbox.addEventListener('change', function() {
    const isVisible = toggleCheckbox.checked;
    
    // Save the new state
    chrome.storage.sync.set({'highlightsVisible': isVisible});
    
    // Send message to content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleHighlights',
          visible: isVisible
        });
      }
    });
  });
  
  // Tab navigation
  const tabHighlights = document.getElementById('tab-highlights');
  const tabCommunity = document.getElementById('tab-community');
  const contentHighlights = document.getElementById('content-highlights');
  const contentCommunity = document.getElementById('content-community');
  
  tabHighlights.addEventListener('click', function() {
    tabHighlights.classList.add('active');
    tabCommunity.classList.remove('active');
    contentHighlights.classList.add('active');
    contentCommunity.classList.remove('active');
  });
  
  tabCommunity.addEventListener('click', function() {
    tabCommunity.classList.add('active');
    tabHighlights.classList.remove('active');
    contentCommunity.classList.add('active');
    contentHighlights.classList.remove('active');
  });
  
  // Load threat analysis data if available
  loadThreatAnalysis();
  
  // Listen for updates from content script
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.action === 'updateThreatAnalysis') {
      updateThreatAnalysisUI(message.data);
    }
  });
});

// Function to load threat analysis data from storage
function loadThreatAnalysis() {
  chrome.storage.local.get('threatAnalysis', function(data) {
    if (data.threatAnalysis) {
      updateThreatAnalysisUI(data.threatAnalysis);
    }
  });
}

// Function to update the UI with threat analysis data
function updateThreatAnalysisUI(threatData) {
  if (!threatData) return;
  
  // Update threat score
  const threatScore = document.getElementById('threat-score');
  threatScore.textContent = `${threatData.threat_score}/10`;
  
  // Update threat score bar
  const threatScoreFill = document.getElementById('threat-score-fill');
  threatScoreFill.style.width = `${threatData.threat_score * 10}%`;
  
  // Update threat industries
  const threatIndustries = document.getElementById('threat-industries');
  threatIndustries.textContent = threatData.threat_industries || 'None detected';
  
  // Update historical risk dots
  const historicalRisk = parseInt(threatData.historical_risk);
  const riskDots = document.querySelectorAll('#historical-risk .risk-dot');
  
  riskDots.forEach((dot, index) => {
    if (index < historicalRisk) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
  
  // Update qualitative analysis
  const qualitativeAnalysis = document.getElementById('qualitative-analysis');
  qualitativeAnalysis.textContent = threatData.qualitative_analysis || 'No analysis available';
}