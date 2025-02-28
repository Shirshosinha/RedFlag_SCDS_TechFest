let highlightsVisible = true;

// Initialize when the page loads
window.addEventListener('load', () => {
  // Check if highlights should be visible (from user preferences)
  chrome.storage.sync.get('highlightsVisible', (data) => {
    if (data.highlightsVisible !== undefined) {
      highlightsVisible = data.highlightsVisible;
    }
    analyzePageContent();
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleHighlights') {
    highlightsVisible = request.visible;
    toggleHighlightVisibility(highlightsVisible);
    sendResponse({status: 'success'});
  }
});

// Main function to analyze the page content
async function analyzePageContent() {
  try {
    // 1. Extract all text content from the page
    const pageText = extractPageText();
    
    // 2. Find all video elements
    const videoElements = document.querySelectorAll('video');
    
    // 3. Send all text content to the backend for analysis
    const textAnalysisResults = await analyzeText(pageText);
    
    // 4. Send video URLs to the backend for deepfake detection
    const videoAnalysisResults = await analyzeVideos(videoElements);
    
    // 5. Highlight opinionated content based on the returned texts
    highlightOpinionatedContent(textAnalysisResults);
    
    // 6. Flag potential deepfake videos
    flagDeepfakeVideos(videoAnalysisResults);
    
    // 7. Set initial visibility based on user preference
    toggleHighlightVisibility(highlightsVisible);
    
  } catch (error) {
    console.error('Error analyzing page content:', error);
  }
}

// Extract all text content from the page
function extractPageText() {
  const textNodes = findTextNodes(document.body);
  return {
    fullText: document.body.innerText,
    textNodes: textNodes.map(node => ({
      text: node.nodeValue.trim(),
      xpath: getXPathForElement(node)
    })).filter(item => item.text !== '')
  };
}

// Helper function to find all text nodes in the document
function findTextNodes(node) {
  const textNodes = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  
  let currentNode;
  while (currentNode = walker.nextNode()) {
    // Skip empty text nodes or those in script/style tags
    if (currentNode.nodeValue.trim() !== '' && 
        !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(currentNode.parentNode.tagName)) {
      textNodes.push(currentNode);
    }
  }
  
  return textNodes;
}

// Get XPath for a node (for reliable node finding later)
function getXPathForElement(element) {
  // If element is a text node, get its parent element first
  const node = element.nodeType === Node.TEXT_NODE ? element.parentNode : element;
  
  if (node === document.body) return '/html/body';
  
  let xpath = '';
  let parent = node;
  
  while (parent !== document.body && parent !== null && parent.parentNode !== null) {
    const index = Array.from(parent.parentNode.children).indexOf(parent) + 1;
    xpath = `/${parent.tagName.toLowerCase()}[${index}]${xpath}`;
    parent = parent.parentNode;
  }
  
  return `/html/body${xpath}`;
}

// Send text content to the backend API for analysis
async function analyzeText(pageTextData) {
    const sampleResponse = {
        "opinionatedTexts": [
          { "text": "the", "score": 0.87 },
        ],
        "metadata": {
          "totalScanned": 3254,
          "opinionScore": 0.32,
          "processingTimeMs": 245
        }
      };
    return sampleResponse;
  try {
    const response = await fetch('https://your-backend-api.com/analyze-text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        url: window.location.href,
        content: pageTextData.fullText
      })
    });
    
    if (!response.ok) {
      throw new Error('Text analysis API request failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error calling text analysis API:', error);
    return { opinionatedTexts: [] };
  }
}

// Send video URLs to the backend API for deepfake detection
async function analyzeVideos(videoElements) {
  const videoUrls = Array.from(videoElements).map(video => ({
    src: video.currentSrc || video.src,
    element: video
  }));

    return { deepfakeVideos: videoUrls.map(v => v.src) };
  
  if (videoUrls.length === 0) return { deepfakeVideos: [] };
  try {
    const response = await fetch('https://your-backend-api.com/analyze-videos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        url: window.location.href,
        videos: videoUrls.map(v => v.src)
      })
    });
    
    if (!response.ok) {
      throw new Error('Video analysis API request failed');
    }
    
    const result = await response.json();
    
    // Match the returned URLs with our video elements
    if (result.deepfakeVideos && Array.isArray(result.deepfakeVideos)) {
      result.deepfakeVideos = result.deepfakeVideos.map(url => {
        const videoData = videoUrls.find(v => v.src === url || url.includes(v.src));
        return {
          url: url,
          element: videoData ? videoData.element : null
        };
      }).filter(item => item.element !== null);
    }
    
    return result;
  } catch (error) {
    console.error('Error calling video analysis API:', error);
    return { deepfakeVideos: [] };
  }
}

function highlightOpinionatedContent(analysisResults) {
    if (!analysisResults || !analysisResults.opinionatedTexts || !Array.isArray(analysisResults.opinionatedTexts)) {
      return;
    }
    
    // Find all text nodes on the page to search through
    const allTextNodes = findTextNodes(document.body);
    
    // For each opinionated text returned by the API
    analysisResults.opinionatedTexts.forEach(opinionItem => {
      // Handle both formats (object with text/score or just string)
      const opinionText = typeof opinionItem === 'object' ? opinionItem.text : opinionItem;
      const opinionScore = typeof opinionItem === 'object' ? opinionItem.score : null;
      
      // Skip if no text to search for
      if (!opinionText) return;
      
      // Find nodes that contain this text
      const matchingNodes = allTextNodes.filter(node => 
        node.nodeValue.includes(opinionText)
      );
      
      // Highlight each matching node
      matchingNodes.forEach(node => {
        const parent = node.parentNode;
        const text = node.nodeValue;
        
        // Prepare the tooltip text
        let tooltipText = 'Opinionated content detected';
        if (opinionScore !== null) {
          const scorePercent = Math.round(opinionScore * 100);
          tooltipText += ` (${scorePercent}% confidence)`;
        }
        
        // If text completely matches the node, highlight the whole node
        if (text.trim() === opinionText.trim()) {
          const highlightedText = document.createElement('span');
          highlightedText.className = 'opinion-highlight';
          highlightedText.title = tooltipText;
          highlightedText.dataset.opinionScore = opinionScore !== null ? opinionScore : '';
          highlightedText.textContent = text;
          
          // Add more intense highlighting for higher scores
          if (opinionScore !== null) {
            const intensity = Math.floor(opinionScore * 100);
            highlightedText.style.backgroundColor = `rgba(255, ${255 - intensity}, ${150 - intensity}, 0.7)`;
          }
          
          parent.replaceChild(highlightedText, node);
        } 
        // If text is within the node, highlight just that part
        else {
          const parts = text.split(new RegExp(`(${escapeRegExp(opinionText)})`, 'g'));
          const fragment = document.createDocumentFragment();
          
          parts.forEach(part => {
            if (part === opinionText) {
              const highlightedText = document.createElement('span');
              highlightedText.className = 'opinion-highlight';
              highlightedText.title = tooltipText;
              highlightedText.dataset.opinionScore = opinionScore !== null ? 'Bias Score: '+opinionScore : '';
              highlightedText.textContent = part;
              
              // Add more intense highlighting for higher scores
              if (opinionScore !== null) {
                const intensity = Math.floor(opinionScore * 100);
                highlightedText.style.backgroundColor = `rgba(255, ${255 - intensity}, ${150 - intensity}, 0.7)`;
              }
              
              fragment.appendChild(highlightedText);
            } else if (part !== '') {
              fragment.appendChild(document.createTextNode(part));
            }
          });
          
          parent.replaceChild(fragment, node);
        }
      });
    });
  }

// Escape special characters for RegExp
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Updated flagDeepfakeVideos function
function flagDeepfakeVideos(analysisResults) {
    if (!analysisResults || !analysisResults.deepfakeVideos || !Array.isArray(analysisResults.deepfakeVideos)) {
      return;
    }
    
    analysisResults.deepfakeVideos.forEach(item => {
      let videoElement;
      
      // Handle both object format and string format
      if (typeof item === 'object' && item.element) {
        videoElement = item.element;
      } else if (typeof item === 'object' && item.url) {
        // Find video by URL
        videoElement = Array.from(document.querySelectorAll('video')).find(
          video => video.src === item.url || video.currentSrc === item.url
        );
      } else if (typeof item === 'string') {
        // If item is just a URL string
        videoElement = Array.from(document.querySelectorAll('video')).find(
          video => video.src === item || video.currentSrc === item
        );
      }
      
      if (!videoElement) return;
      
      // Check if we already added a warning to this video
      if (videoElement.hasAttribute('data-deepfake-flagged')) {
        return;
      }
      
      // Mark this video as flagged to avoid duplicates
      videoElement.setAttribute('data-deepfake-flagged', 'true');
      
      // Get confidence score if available
      const confidence = typeof item === 'object' && item.confidence 
        ? item.confidence 
        : null;
      
      // Create container for the video if it doesn't exist
      let videoContainer = videoElement.parentNode;
      const videoComputedStyle = window.getComputedStyle(videoElement);
      
      // If parent doesn't have position relative/absolute, create a wrapper
      if (videoComputedStyle.position === 'static' || 
          window.getComputedStyle(videoContainer).position === 'static') {
        
        // Create a wrapper div
        const wrapper = document.createElement('div');
        wrapper.className = 'deepfake-video-container';
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        wrapper.style.width = videoElement.offsetWidth + 'px';
        wrapper.style.height = videoElement.offsetHeight + 'px';
        
        // Insert wrapper before video in the DOM
        videoElement.parentNode.insertBefore(wrapper, videoElement);
        
        // Move video into wrapper
        wrapper.appendChild(videoElement);
        
        // Update video container reference
        videoContainer = wrapper;
      } else {
        // Ensure container has position relative for absolute positioning
        videoContainer.style.position = 'relative';
      }
      
      // Create a warning banner
      const warningBanner = document.createElement('div');
      warningBanner.className = 'deepfake-warning';
      
      // Add confidence score if available
      let warningText = '⚠️ Potential deepfake video detected';
      if (confidence !== null) {
        const confidencePercent = Math.round(confidence * 100);
        warningText += ` (${confidencePercent}% confidence)`;
      }
      
      warningBanner.innerHTML = warningText;
      
      // Add a colored border around the video
      videoElement.style.border = '3px solid red';
      
      // Add the warning banner to the container
      videoContainer.appendChild(warningBanner);
      
      // Ensure the banner stays visible by adding a direct event handler
      videoElement.addEventListener('play', function() {
        // Make sure warning is visible when video plays
        warningBanner.style.display = 'block';
      });
    });
  }

function toggleHighlightVisibility(visible) {
    const opinionHighlights = document.querySelectorAll('.opinion-highlight');
    const deepfakeWarnings = document.querySelectorAll('.deepfake-warning');
    
    opinionHighlights.forEach(highlight => {
      if (visible) {
        // Restore the score-based coloring
        const score = parseFloat(highlight.dataset.opinionScore);
        if (!isNaN(score)) {
          const intensity = Math.floor(score * 100);
          highlight.style.backgroundColor = `rgba(255, ${255 - intensity}, ${150 - intensity}, 0.7)`;
        } else {
          highlight.style.backgroundColor = 'rgba(255, 221, 158, 0.7)'; // Default yellow
        }
        highlight.style.color = '';
      } else {
        // Hide the highlighting
        highlight.style.backgroundColor = 'transparent';
        highlight.style.color = '';
      }
    });
    
    deepfakeWarnings.forEach(warning => {
      warning.style.display = visible ? 'block' : 'none';
    });
  }

  