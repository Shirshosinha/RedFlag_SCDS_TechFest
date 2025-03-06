
let highlightsVisible = true;

// Initialize when the page loads
window.addEventListener('load', () => {
  // Check if highlights should be visible (from user preferences)
  chrome.storage.sync.get('highlightsVisible', (data) => {
    if (data.highlightsVisible !== undefined) {
      highlightsVisible = data.highlightsVisible;
    }
    analyzePageContent();
    // Start monitoring for dynamically added video elements
    monitorForNewVideoElements();
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleHighlights') {
    highlightsVisible = request.visible;
    toggleHighlightVisibility(highlightsVisible);
    sendResponse({ status: 'success' });
  }
});

// Main function to analyze the page content
async function analyzePageContent() {
  try {
    // 1. Extract all text content from the page
    const pageText = extractPageText();
    
    // 2. Find all video elements currently on the page
    const videoElements = document.querySelectorAll('video');
    
    // 3. Send all text content to the backend for analysis
    const textAnalysisResults = await analyzeText(pageText);
    
    // 4. Analyze existing video elements for deepfake detection
    analyzeVideos(videoElements);
    
    // 5. Highlight opinionated content based on the returned texts
    highlightOpinionatedContent(textAnalysisResults);
    
    // 6. (Optional) Flag potential deepfake videos if results are accumulated elsewhere
    // flagDeepfakeVideos({ deepfakeVideos: [] });
    
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
    if (
      currentNode.nodeValue.trim() !== '' &&
      !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(currentNode.parentNode.tagName)
    ) {
      textNodes.push(currentNode);
    }
  }
  return textNodes;
}

// Get XPath for a node (for reliable node finding later)
function getXPathForElement(element) {
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

/* ---------- Modified Text Analysis Part ---------- */

async function analyzeText(pageTextData) {
  try {
    const response = await fetch('http://127.0.0.1:8001/analyze/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: pageTextData.fullText })
    });
    if (!response.ok) {
      throw new Error('Text analysis API request failed');
    }
    return await response.json();
  } catch (error) {
    console.error('Error calling text analysis API:', error);
    return { biased_sentences: {}, misinformation_sentences: {} };
  }
}

function highlightOpinionatedContent(analysisResults) {
  if (!analysisResults) return;
  
  // Style insertion for tooltips
  if (!document.getElementById('extension-tooltip-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'extension-tooltip-styles';
    styleElement.textContent = `
      .tooltip-container {
        position: absolute;
        z-index: 10000;
        max-width: 320px;
        background-color: #fff;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 12px;
        font-size: 14px;
        color: #333;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s;
        visibility: hidden;
        line-height: 1.4;
        border-left: 4px solid transparent;
      }
      
      .tooltip-bias {
        border-left-color: #FFA726;
      }
      
      .tooltip-misinfo {
        border-left-color: #F44336;
      }
      
      .tooltip-title {
        font-weight: bold;
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        font-size: 15px;
      }
      
      .tooltip-title-bias {
        color: #E65100;
      }
      
      .tooltip-title-misinfo {
        color: #B71C1C;
      }
      
      .tooltip-title-icon {
        margin-right: 6px;
      }
      
      .tooltip-content {
        margin-bottom: 8px;
      }
      
      .tooltip-score {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: bold;
        background-color: #EEEEEE;
        margin-left: 8px;
      }
      
      .tooltip-score-high {
        background-color: #FFCCBC;
        color: #D84315;
      }
      
      .tooltip-score-medium {
        background-color: #FFE0B2;
        color: #EF6C00;
      }
      
      .tooltip-score-low {
        background-color: #FFF9C4;
        color: #F57F17;
      }
      
      .tooltip-fact-check-item {
        margin-top: 4px;
        padding: 8px;
        background-color: #F5F5F5;
        border-radius: 4px;
        font-size: 13px;
      }
      
      .tooltip-fact-check-result {
        font-weight: bold;
        text-transform: uppercase;
        font-size: 11px;
        padding: 1px 5px;
        border-radius: 3px;
        display: inline-block;
        margin-top: 3px;
      }
      
      .result-false {
        background-color: #FFCDD2;
        color: #C62828;
      }
      
      .result-misleading {
        background-color: #FFE0B2;
        color: #E65100;
      }
      
      .result-unproven {
        background-color: #E1F5FE;
        color: #0277BD;
      }
    `;
    document.head.appendChild(styleElement);
  }
  
  // Process bias detection
  if (analysisResults.biased_sentences && typeof analysisResults.biased_sentences === 'object') {
    const allTextNodes = findTextNodes(document.body);
    
    Object.entries(analysisResults.biased_sentences).forEach(([sentence, score]) => {
      if (!sentence) return;
      
      const matchingNodes = allTextNodes.filter(node => node.nodeValue.includes(sentence));
      
      matchingNodes.forEach(node => {
        const parent = node.parentNode;
        if (!parent) return; // Safety check
        
        const text = node.nodeValue;
        const tooltipId = `bias-tooltip-${Math.random().toString(36).substr(2, 9)}`;
        
        // Create tooltip element
        let tooltipElem = document.createElement('div');
        tooltipElem.id = tooltipId;
        tooltipElem.className = 'tooltip-container tooltip-bias';
        
        // Format score for display
        const confidenceScore = score !== null ? Math.round(score * 100) : 0;
        let scoreClass = 'tooltip-score';
        if (confidenceScore >= 75) scoreClass += ' tooltip-score-high';
        else if (confidenceScore >= 50) scoreClass += ' tooltip-score-medium';
        else scoreClass += ' tooltip-score-low';
        
        tooltipElem.innerHTML = `
          <div class="tooltip-title tooltip-title-bias">
            <span class="tooltip-title-icon">⚠️</span> Biased Content Detected
            <span class="${scoreClass}">${confidenceScore}%</span>
          </div>
          <div class="tooltip-content">
            This text shows signs of bias in its language or framing.
          </div>
        `;
        
        document.body.appendChild(tooltipElem);
        
        if (text.trim() === sentence.trim()) {
          // Replace the whole node with highlighted span
          const highlightedText = document.createElement('span');
          highlightedText.className = 'opinion-highlight';
          highlightedText.dataset.tooltipId = tooltipId;
          highlightedText.dataset.opinionScore = score !== null ? score : '';
          highlightedText.textContent = text;
          
          if (score !== null) {
            const intensity = Math.floor(score * 100);
            highlightedText.style.backgroundColor = `rgba(255, ${255 - intensity}, ${150 - intensity}, 0.7)`;
          }
          
          // Add hover listeners for tooltip
          addTooltipListeners(highlightedText, tooltipElem);
          
          parent.replaceChild(highlightedText, node);
        } else {
          // Handle partial text matches
          const parts = text.split(new RegExp(`(${escapeRegExp(sentence)})`, 'g'));
          const fragment = document.createDocumentFragment();
          
          parts.forEach(part => {
            if (part === sentence) {
              const highlightedText = document.createElement('span');
              highlightedText.className = 'opinion-highlight';
              highlightedText.dataset.tooltipId = tooltipId;
              highlightedText.dataset.opinionScore = score !== null ? score : '';
              highlightedText.textContent = part;
              
              if (score !== null) {
                const intensity = Math.floor(score * 100);
                highlightedText.style.backgroundColor = `rgba(255, ${255 - intensity}, ${150 - intensity}, 0.7)`;
              }
              
              // Add hover listeners for tooltip
              addTooltipListeners(highlightedText, tooltipElem);
              
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
  
  // Process misinformation detection
  if (analysisResults.misinformation_sentences && typeof analysisResults.misinformation_sentences === 'object') {
    const allTextNodes = findTextNodes(document.body);
    
    Object.entries(analysisResults.misinformation_sentences).forEach(([sentence, info]) => {
      if (!sentence) return;
      
      const tooltipId = `misinfo-tooltip-${Math.random().toString(36).substr(2, 9)}`;
      const matchingNodes = allTextNodes.filter(node => node.nodeValue.includes(sentence));
      
      // Create tooltip element
      let tooltipElem = document.createElement('div');
      tooltipElem.id = tooltipId;
      tooltipElem.className = 'tooltip-container tooltip-misinfo';
      
      let tooltipContent = `
        <div class="tooltip-title tooltip-title-misinfo">
          <span class="tooltip-title-icon">❌</span> Misinformation Detected
        </div>
        <div class="tooltip-content">
          This text contains information that may be false or misleading.
        </div>
      `;
      
      // Add fact-check details if available
      if (info && info["Fact-Check Matches"] && Array.isArray(info["Fact-Check Matches"])) {
        tooltipContent += `<div class="tooltip-fact-checks">`;
        
        info["Fact-Check Matches"].forEach(match => {
          let resultClass = 'tooltip-fact-check-result';
          if (match["Fact-Check Result"].toLowerCase().includes('false')) {
            resultClass += ' result-false';
          } else if (match["Fact-Check Result"].toLowerCase().includes('misleading')) {
            resultClass += ' result-misleading';
          } else if (match["Fact-Check Result"].toLowerCase().includes('unproven')) {
            resultClass += ' result-unproven';
          }
          
          tooltipContent += `
            <div class="tooltip-fact-check-item">
              <div>${match["Claim"]}</div>
              <span class="${resultClass}">${match["Fact-Check Result"]}</span>
            </div>
          `;
        });
        
        tooltipContent += `</div>`;
      }
      
      tooltipElem.innerHTML = tooltipContent;
      document.body.appendChild(tooltipElem);
      
      matchingNodes.forEach(node => {
        const parent = node.parentNode;
        if (!parent) return; // Safety check
        
        const text = node.nodeValue;
        
        if (text.trim() === sentence.trim()) {
          // Replace the whole node with highlighted span
          const highlightedText = document.createElement('span');
          highlightedText.className = 'misinfo-highlight';
          highlightedText.dataset.tooltipId = tooltipId;
          highlightedText.textContent = text;
          highlightedText.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
          
          // Add hover listeners for tooltip
          addTooltipListeners(highlightedText, tooltipElem);
          
          parent.replaceChild(highlightedText, node);
        } else {
          // Handle partial text matches
          const parts = text.split(new RegExp(`(${escapeRegExp(sentence)})`, 'g'));
          const fragment = document.createDocumentFragment();
          
          parts.forEach(part => {
            if (part === sentence) {
              const highlightedText = document.createElement('span');
              highlightedText.className = 'misinfo-highlight';
              highlightedText.dataset.tooltipId = tooltipId;
              highlightedText.textContent = part;
              highlightedText.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
              
              // Add hover listeners for tooltip
              addTooltipListeners(highlightedText, tooltipElem);
              
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
}

// Helper function to add tooltip hover behavior
function addTooltipListeners(element, tooltipElement) {
  element.addEventListener('mouseenter', (e) => {
    // Position the tooltip
    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    tooltipElement.style.top = `${rect.top + scrollTop - tooltipElement.offsetHeight - 10}px`;
    tooltipElement.style.left = `${rect.left + scrollLeft + (rect.width / 2) - (tooltipElement.offsetWidth / 2)}px`;
    
    // Check if tooltip would appear above the viewport
    if (rect.top < tooltipElement.offsetHeight + 20) {
      // Show tooltip below the element instead
      tooltipElement.style.top = `${rect.bottom + scrollTop + 10}px`;
    }
    
    // Check if tooltip would overflow on the right
    const rightEdge = rect.left + scrollLeft + (rect.width / 2) + (tooltipElement.offsetWidth / 2);
    if (rightEdge > window.innerWidth) {
      tooltipElement.style.left = `${window.innerWidth - tooltipElement.offsetWidth - 10}px`;
    }
    
    // Check if tooltip would overflow on the left
    const leftEdge = rect.left + scrollLeft + (rect.width / 2) - (tooltipElement.offsetWidth / 2);
    if (leftEdge < 10) {
      tooltipElement.style.left = '10px';
    }
    
    // Show tooltip
    tooltipElement.style.visibility = 'visible';
    tooltipElement.style.opacity = '1';
  });
  
  element.addEventListener('mouseleave', (e) => {
    // Hide tooltip
    tooltipElement.style.visibility = 'hidden';
    tooltipElement.style.opacity = '0';
  });
}




function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// Continuously record 20-second chunks while any video is playing and flag if FAKE.
function analyzeVideos(videoElements) {
  if (videoElements.length === 0) {
    console.log('No video elements found on this page.');
    return { deepfakeVideos: [] };
  }

  videoElements.forEach((video, index) => {
    let currentRecorder = null;

    function startRecording() {
      if (currentRecorder && currentRecorder.state === "recording") return;
      if (video.paused) video.play();
      const stream = video.captureStream();
      currentRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      
      currentRecorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          const blob = event.data;
          console.log(`Recorded 20-sec chunk for video ${index}:`, blob);
          const formData = new FormData();
          formData.append('file', blob, `recording_${index}_chunk_${Date.now()}.webm`);
          
          fetch('http://127.0.0.1:8000/video/api/video_predict', {
            method: 'POST',
            body: formData,
          })
            .then(response => response.json())
            .then(data => {
              console.log(`Backend response for video ${index} chunk:`, data);
              // If the backend response indicates the video is FAKE, flag it immediately.
              if (data.result && data.result === "FAKE") {
                flagDeepfakeVideo(video, data);
              }
            })
            .catch(error => {
              console.error('Error sending video chunk:', error);
            });
        }
      };

      currentRecorder.onerror = error => {
        console.error('MediaRecorder error for video', index, error);
      };

      currentRecorder.start(10000);
      console.log(`Started recording 10-sec chunks for video ${index}`);
    }

    function stopRecording() {
      if (currentRecorder && currentRecorder.state !== "inactive") {
        currentRecorder.stop();
        console.log(`Stopped recording for video ${index}`);
      }
    }

    video.addEventListener('play', () => {
      console.log(`Play event detected for video ${index}`);
      startRecording();
    });
    video.addEventListener('pause', () => {
      console.log(`Pause event detected for video ${index}`);
      stopRecording();
    });
    video.addEventListener('ended', () => {
      console.log(`Ended event detected for video ${index}`);
      stopRecording();
    });
    
    // If the video is already playing, start recording immediately.
    if (!video.paused) {
      startRecording();
    }
  });
  
  return { deepfakeVideos: [] };
}

// Flag a video immediately when a fake response is received.
function flagDeepfakeVideo(video, data) {
  if (!video || video.hasAttribute('data-deepfake-flagged')) return;
  
  video.setAttribute('data-deepfake-flagged', 'true');
  let videoContainer = video.parentNode;
  const videoComputedStyle = window.getComputedStyle(video);
  
  if (videoComputedStyle.position === 'static' || 
      window.getComputedStyle(videoContainer).position === 'static') {
    const wrapper = document.createElement('div');
    wrapper.className = 'deepfake-video-container';
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    wrapper.style.width = video.offsetWidth + 'px';
    wrapper.style.height = video.offsetHeight + 'px';
    video.parentNode.insertBefore(wrapper, video);
    wrapper.appendChild(video);
    videoContainer = wrapper;
  } else {
    videoContainer.style.position = 'relative';
  }
  
  const warningBanner = document.createElement('div');
  warningBanner.className = 'deepfake-warning';
  let warningText = '⚠️ Potential deepfake video detected';
  // Optionally, include additional info such as confidence from data.accuracy
  warningBanner.innerHTML = warningText;
  video.style.border = '3px solid red';
  videoContainer.appendChild(warningBanner);
  
  video.addEventListener('play', () => {
    warningBanner.style.display = 'block';
  });
}

// Helper function to add tooltip hover behavior
function addTooltipListeners(element, tooltipElement) {
  element.addEventListener('mouseenter', (e) => {
    // Position the tooltip
    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    tooltipElement.style.top = `${rect.top + scrollTop - tooltipElement.offsetHeight - 10}px`;
    tooltipElement.style.left = `${rect.left + scrollLeft + (rect.width / 2) - (tooltipElement.offsetWidth / 2)}px`;
    
    // Check if tooltip would appear above the viewport
    if (rect.top < tooltipElement.offsetHeight + 20) {
      // Show tooltip below the element instead
      tooltipElement.style.top = `${rect.bottom + scrollTop + 10}px`;
    }
    
    // Check if tooltip would overflow on the right
    const rightEdge = rect.left + scrollLeft + (rect.width / 2) + (tooltipElement.offsetWidth / 2);
    if (rightEdge > window.innerWidth) {
      tooltipElement.style.left = `${window.innerWidth - tooltipElement.offsetWidth - 10}px`;
    }
    
    // Check if tooltip would overflow on the left
    const leftEdge = rect.left + scrollLeft + (rect.width / 2) - (tooltipElement.offsetWidth / 2);
    if (leftEdge < 10) {
      tooltipElement.style.left = '10px';
    }
    
    // Show tooltip
    tooltipElement.style.visibility = 'visible';
    tooltipElement.style.opacity = '1';
  });
  
  element.addEventListener('mouseleave', (e) => {
    // Hide tooltip
    tooltipElement.style.visibility = 'hidden';
    tooltipElement.style.opacity = '0';
  });
}

// Modified toggle function to handle visibility of both highlights and tooltips
function toggleHighlightVisibility(visible) {
  const opinionHighlights = document.querySelectorAll('.opinion-highlight');
  const misinfoHighlights = document.querySelectorAll('.misinfo-highlight');
  const deepfakeWarnings = document.querySelectorAll('.deepfake-warning');
  const tooltipContainers = document.querySelectorAll('.tooltip-container');
  
  // Handle bias detection highlights
  opinionHighlights.forEach(highlight => {
    if (visible) {
      const score = parseFloat(highlight.dataset.opinionScore);
      if (!isNaN(score)) {
        const intensity = Math.floor(score * 100);
        highlight.style.backgroundColor = `rgba(255, ${255 - intensity}, ${150 - intensity}, 0.7)`;
      } else {
        highlight.style.backgroundColor = 'rgba(255, 221, 158, 0.7)';
      }
      highlight.style.pointerEvents = 'auto';
    } else {
      highlight.style.backgroundColor = 'transparent';
      highlight.style.pointerEvents = 'none';
    }
  });
  
  // Handle misinformation highlights
  misinfoHighlights.forEach(highlight => {
    if (visible) {
      highlight.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
      highlight.style.pointerEvents = 'auto';
    } else {
      highlight.style.backgroundColor = 'transparent';
      highlight.style.pointerEvents = 'none';
    }
  });
  
  // Hide all tooltips when toggling off
  if (!visible) {
    tooltipContainers.forEach(tooltip => {
      tooltip.style.visibility = 'hidden';
      tooltip.style.opacity = '0';
    });
  }
  
  // Handle deepfake warnings
  deepfakeWarnings.forEach(warning => {
    warning.style.display = visible ? 'block' : 'none';
  });
}

/* ---------- Monitor for New Video Elements Dynamically ---------- */
function monitorForNewVideoElements() {
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName.toLowerCase() === 'video') {
            console.log('New video element detected:', node);
            analyzeVideos([node]);
          } else {
            const videos = node.querySelectorAll && node.querySelectorAll('video');
            if (videos && videos.length > 0) {
              videos.forEach(video => {
                console.log('New video element found in subtree:', video);
                analyzeVideos([video]);
              });
            }
          }
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}