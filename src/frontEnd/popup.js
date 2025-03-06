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
});