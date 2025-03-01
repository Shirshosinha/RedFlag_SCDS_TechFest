// popup.js
document.addEventListener('DOMContentLoaded', function() {
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
  });