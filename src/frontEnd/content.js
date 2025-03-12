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
    // const pageText = extractPageText();
    
    // 2. Find all video elements currently on the page
    const videoElements = document.querySelectorAll('video');
    
    // 3. Send all text content to the backend for analysisx
    const textAnalysisResults = await analyzeText();
    
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
      body: JSON.stringify({url: window.location.href})
    });
    if (!response.ok) {
      throw new Error('Text analysis API request failed');
    }
    return await response.json();
  } catch (error) {
    console.error('Error calling text analysis API:', error);
    return { biased_sentences: [], misinformation_sentences: [] };
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
      
      .tooltip-source-links {
        margin-top: 8px;
        font-size: 12px;
      }
      
      .tooltip-source-link {
        display: block;
        color: #1565C0;
        text-decoration: underline;
        margin-bottom: 4px;
        word-break: break-all;
      }
    `;
    document.head.appendChild(styleElement);
  }
  
  const allTextNodes = findTextNodes(document.body);
  
  // Create a set to keep track of sentences already highlighted as misinformation
  const misinfoSentences = new Set();
  
  // Process misinformation detection first (priority over bias)
  if (analysisResults.misinformation_sentences && Array.isArray(analysisResults.misinformation_sentences)) {
    analysisResults.misinformation_sentences.forEach(item => {
      // Get the text of the sentence from the first key in the object if it's an object
      // or directly from the item.text if it's in the new format
      const sentence = item.text || Object.keys(item)[0];
      
      if (!sentence) return;
      misinfoSentences.add(sentence);
      
      const tooltipId = `misinfo-tooltip-${Math.random().toString(36).substr(2, 9)}`;
      const matchingNodes = allTextNodes.filter(node => node.nodeValue.includes(sentence));
      
      // Create tooltip element
      let tooltipElem = document.createElement('div');
      tooltipElem.id = tooltipId;
      tooltipElem.className = 'tooltip-container tooltip-misinfo';
      
      // Process the explanation and classification
      let explanation = "";
      let classification = "";
      let sources = [];
      
      if (item.text) {
        // New response format
        explanation = item.explanation || "";
        classification = item.classification || "";
        sources = item.sources || [];
      } else {
        // Old response format - not used but kept for backward compatibility
        const info = Object.values(item)[0];
        if (typeof info === 'object' && info["Fact-Check Matches"]) {
          explanation = info["Fact-Check Matches"][0]?.Explanation || "";
          classification = info["Fact-Check Matches"][0]?.["Fact-Check Result"] || "";
        }
      }
      
      let tooltipContent = `
        <div class="tooltip-title tooltip-title-misinfo">
          <span class="tooltip-title-icon">❌</span> Misinformation Detected
        </div>
        <div class="tooltip-content">
          <p>${explanation}</p>
        </div>
      `;
      
      // Add sources if available
      if (sources && sources.length > 0) {
        tooltipContent += `<div class="tooltip-source-links"><strong>Sources:</strong>`;
        
        sources.forEach(source => {
          // Create a friendly title from the URL
          let sourceTitle = "Source Link";
          if (source.url) {
            try {
              const urlObj = new URL(source.url);
              
              // Try to extract a meaningful name from the URL path
              // For Facebook, extract organization name from the path
              if (urlObj.hostname.includes('facebook.com')) {
                const pathParts = urlObj.pathname.split('/').filter(part => part);
                if (pathParts.length > 0) {
                  // Use the first path component after the domain as the source name
                  // For example: facebook.com/TheOnion -> "TheOnion"
                  sourceTitle = `${pathParts[0]} (Facebook)`;
                } else {
                  sourceTitle = "Facebook";
                }
              } else {
                // For other domains, use the domain name
                sourceTitle = urlObj.hostname.replace(/^www\./, '');
              }
            } catch (e) {
              // If parsing fails, use a generic title
              sourceTitle = "Source " + (sources.indexOf(source) + 1);
            }
          }
          
          tooltipContent += `
            <a class="tooltip-source-link" href="${source.url}" target="_blank" rel="noopener noreferrer">
              ${sourceTitle}
            </a>
          `;
        });
        
        tooltipContent += `</div>`;
      }
      
      tooltipElem.innerHTML = tooltipContent;
      document.body.appendChild(tooltipElem);
      
      highlightSentenceInNodes(sentence, matchingNodes, 'misinfo-highlight', tooltipId, tooltipElem);
    });
  }
  
  // Process bias detection (only if not already highlighted as misinformation)
  if (analysisResults.biased_sentences && Array.isArray(analysisResults.biased_sentences)) {
    analysisResults.biased_sentences.forEach(item => {
      // Get the sentence and score
      const sentence = Object.keys(item)[0];
      const score = Object.values(item)[0];
      
      if (!sentence || misinfoSentences.has(sentence)) return; // Skip if already highlighted as misinfo
      
      const matchingNodes = allTextNodes.filter(node => node.nodeValue.includes(sentence));
      
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
      
      highlightSentenceInNodes(sentence, matchingNodes, 'opinion-highlight', tooltipId, tooltipElem, score);
    });
  }
}
// Helper function to highlight a sentence in multiple text nodes
function highlightSentenceInNodes(sentence, nodes, highlightClass, tooltipId, tooltipElement, score = null) {
  nodes.forEach(node => {
    const parent = node.parentNode;
    if (!parent) return; // Safety check
    
    const text = node.nodeValue;
    
    if (text.trim() === sentence.trim()) {
      // Replace the whole node with highlighted span
      const highlightedText = document.createElement('span');
      highlightedText.className = highlightClass;
      highlightedText.dataset.tooltipId = tooltipId;
      
      if (score !== null) {
        highlightedText.dataset.opinionScore = score;
        const intensity = Math.floor(score * 100);
        highlightedText.style.backgroundColor = `rgba(255, ${255 - intensity}, ${150 - intensity}, 0.7)`;
      } else if (highlightClass === 'misinfo-highlight') {
        highlightedText.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
      }
      
      highlightedText.textContent = text;
      
      // Add hover listeners for tooltip
      addTooltipListeners(highlightedText, tooltipElement);
      
      parent.replaceChild(highlightedText, node);
    } else {
      // Handle partial text matches
      const parts = text.split(new RegExp(`(${escapeRegExp(sentence)})`, 'g'));
      const fragment = document.createDocumentFragment();
      
      parts.forEach(part => {
        if (part === sentence) {
          const highlightedText = document.createElement('span');
          highlightedText.className = highlightClass;
          highlightedText.dataset.tooltipId = tooltipId;
          
          if (score !== null) {
            highlightedText.dataset.opinionScore = score;
            const intensity = Math.floor(score * 100);
            highlightedText.style.backgroundColor = `rgba(255, ${255 - intensity}, ${150 - intensity}, 0.7)`;
          } else if (highlightClass === 'misinfo-highlight') {
            highlightedText.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
          }
          
          highlightedText.textContent = part;
          
          // Add hover listeners for tooltip
          addTooltipListeners(highlightedText, tooltipElement);
          
          fragment.appendChild(highlightedText);
        } else if (part !== '') {
          fragment.appendChild(document.createTextNode(part));
        }
      });
      
      parent.replaceChild(fragment, node);
    }
  });
}
function addTooltipListeners(element, tooltipElement) {
  let hideTimeout;
  function showTooltip() {
    clearTimeout(hideTimeout);
    tooltipElement.style.visibility = 'visible';
    tooltipElement.style.opacity = '1';
    tooltipElement.style.pointerEvents = 'auto';
  }
  function hideTooltip() {
    hideTimeout = setTimeout(() => {
      tooltipElement.style.visibility = 'hidden';
      tooltipElement.style.opacity = '0';
      tooltipElement.style.pointerEvents = 'none';
    }, 50); // Small delay to allow movement
  }
  element.addEventListener('mouseenter', (e) => {
    // Position the tooltip
    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    tooltipElement.style.top = `${rect.top + scrollTop - tooltipElement.offsetHeight - 10}px`;
    tooltipElement.style.left = `${rect.left + scrollLeft + (rect.width / 2) - (tooltipElement.offsetWidth / 2)}px`;
    
    // Check if tooltip would appear above the viewport
    if (rect.top < tooltipElement.offsetHeight + 20) {
      tooltipElement.style.top = `${rect.bottom + scrollTop + 10}px`;
    }
    
    // Prevent overflow on right side
    const rightEdge = rect.left + scrollLeft + (rect.width / 2) + (tooltipElement.offsetWidth / 2);
    if (rightEdge > window.innerWidth) {
      tooltipElement.style.left = `${window.innerWidth - tooltipElement.offsetWidth - 10}px`;
    }
    // Prevent overflow on left side
    const leftEdge = rect.left + scrollLeft + (rect.width / 2) - (tooltipElement.offsetWidth / 2);
    if (leftEdge < 10) {
      tooltipElement.style.left = '10px';
    }
    showTooltip();
  });
  element.addEventListener('mouseleave', hideTooltip);
  tooltipElement.addEventListener('mouseenter', showTooltip);
  tooltipElement.addEventListener('mouseleave', hideTooltip);
  // Make tooltip links clickable by stopping propagation
  const links = tooltipElement.querySelectorAll('a');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(link.href, '_blank');
    });
    link.style.pointerEvents = 'auto';
  });
}



function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// Continuously record 20-second chunks while any video is playing and flag if FAKE.
// function analyzeVideos(videoElements) {
//   if (videoElements.length === 0) {
//     console.log('No video elements found on this page.');
//     return { deepfakeVideos: [] };
//   }

//   videoElements.forEach((video, index) => {
//     let currentRecorder = null;

//     video.addEventListener('loadeddata', () => {
//       // Remove the warning banner if it exists
//       const videoContainer = video.parentNode;
//       const warningBanner = videoContainer.querySelector('.deepfake-warning');
//       if (warningBanner) {
//         warningBanner.remove();
//       }
//       // Remove the flagged attribute and border
//       video.removeAttribute('data-deepfake-flagged');
//       video.style.border = '';
//     });

//     function startRecording() {
//       if (currentRecorder && currentRecorder.state === "recording") return;
//       if (video.paused) video.play();
//       const stream = video.captureStream();
//       currentRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      
//       currentRecorder.ondataavailable = event => {
//         if (event.data && event.data.size > 0) {
//           const blob = event.data;
//           console.log(`Recorded 20-sec chunk for video ${index}:`, blob);
//           const formData = new FormData();
//           formData.append('file', blob, `recording_${index}_chunk_${Date.now()}.webm`);
//           formData.append('video_url', video.src);
          
//           fetch('http://127.0.0.1:8000/video/api/video_predict', {
//             method: 'POST',
//             body: formData,
//           })
//             .then(response => response.json())
//             .then(data => {
//               console.log(`Backend response for video ${index} chunk:`, data);
//               // If the backend response indicates the video is FAKE, flag it immediately.
//               if (data.result && data.result === "FAKE") {
//                 flagDeepfakeVideo(video, data);
//               }
//             })
//             .catch(error => {
//               console.error('Error sending video chunk:', error);
//             });
//         }
//       };

//       currentRecorder.onerror = error => {
//         console.error('MediaRecorder error for video', index, error);
//       };

//       currentRecorder.start(3000);
//       console.log(`Started recording 3-sec chunks for video ${index}`);
//     }

//     function stopRecording() {
//       if (currentRecorder && currentRecorder.state !== "inactive") {
//         currentRecorder.stop();
//         console.log(`Stopped recording for video ${index}`);
//       }
//     }

//     video.addEventListener('play', () => {
//       console.log(`Play event detected for video ${index}`);
//       startRecording();
//     });
//     video.addEventListener('pause', () => {
//       console.log(`Pause event detected for video ${index}`);
//       stopRecording();
//     });
//     video.addEventListener('ended', () => {
//       console.log(`Ended event detected for video ${index}`);
//       stopRecording();
//     });
    
//     // If the video is already playing, start recording immediately.
//     if (!video.paused) {
//       startRecording();
//     }
//   });
  
//   return { deepfakeVideos: [] };
// }

// // Flag a video immediately when a fake response is received.
// function flagDeepfakeVideo(video, data) {
//   if (!video || video.hasAttribute('data-deepfake-flagged')) return;
  
//   video.setAttribute('data-deepfake-flagged', 'true');
//   let videoContainer = video.parentNode;
//   const videoComputedStyle = window.getComputedStyle(video);
  
//   if (videoComputedStyle.position === 'static' || 
//       window.getComputedStyle(videoContainer).position === 'static') {
//     const wrapper = document.createElement('div');
//     wrapper.className = 'deepfake-video-container';
//     wrapper.style.position = 'relative';
//     wrapper.style.display = 'inline-block';
//     wrapper.style.width = video.offsetWidth + 'px';
//     wrapper.style.height = video.offsetHeight + 'px';
//     video.parentNode.insertBefore(wrapper, video);
//     wrapper.appendChild(video);
//     videoContainer = wrapper;
//   } else {
//     videoContainer.style.position = 'relative';
//   }
  
//   const warningBanner = document.createElement('div');
//   warningBanner.className = 'deepfake-warning';
//   let warningText = '⚠️ Potential deepfake video detected';
//   // Optionally, include additional info such as confidence from data.accuracy
//   warningBanner.innerHTML = warningText;
//   video.style.border = '3px solid red';
//   videoContainer.appendChild(warningBanner);
  
//   video.addEventListener('play', () => {
//     warningBanner.style.display = 'block';
//   });
// }

function analyzeVideos(videoElements) {
  if (videoElements.length === 0) {
    console.log('No video elements found on this page.');
    return { deepfakeVideos: [] };
  }

  videoElements.forEach((video, index) => {
    let currentRecorder = null;

    video.addEventListener('loadeddata', () => {
      // Remove the warning banner if it exists
      const videoContainer = video.parentNode;
      const warningBanner = videoContainer.querySelector('.deepfake-warning');
      if (warningBanner) {
        warningBanner.remove();
      }
      // Remove the flagged attribute and border
      video.removeAttribute('data-deepfake-flagged');
      video.style.border = '';
    });

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
          formData.append('video_url', window.location.href);
          
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

      currentRecorder.start(3000);
      console.log(`Started recording 3-sec chunks for video ${index}`);
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
  
  // Add CSS to head once
  if (!document.getElementById('deepfake-warning-styles')) {
    const style = document.createElement('style');
    style.id = 'deepfake-warning-styles';
    style.textContent = `
      .deepfake-warning {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        background-color: rgba(255, 0, 0, 0.8);
        color: white;
        padding: 8px;
        font-size: 14px;
        text-align: center;
        z-index: 9999;
        pointer-events: auto;
      }
      .deepfake-warning-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      .warning-message {
        font-weight: bold;
      }
      .feedback-buttons {
        display: flex;
        gap: 10px;
      }
      .feedback-btn {
        padding: 5px 15px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        transition: background-color 0.2s;
      }
      .real-btn {
        background-color: #4CAF50;
        color: white;
      }
      .fake-btn {
        background-color: #f44336;
        color: white;
      }
      .feedback-btn:hover {
        opacity: 0.9;
      }
      .feedback-status {
        font-size: 13px;
        font-style: italic;
      }
    `;
    document.head.appendChild(style);
  }
  
  const warningBanner = document.createElement('div');
  warningBanner.className = 'deepfake-warning';
  warningBanner.style.pointerEvents = 'auto'; // Ensure clicks are registered
  
  // Create warning message and feedback buttons
  warningBanner.innerHTML = `
    <div class="deepfake-warning-content">
      <div class="warning-message">Potential deepfake detected! Are we right?</div>
      <div class="feedback-buttons">
        <button type="button" class="feedback-btn real-btn">No</button>
        <button type="button" class="feedback-btn fake-btn">Yes</button>
      </div>
      <div class="feedback-status" style="display: none;">Thank you for your feedback!</div>
    </div>
  `;
  
  video.style.border = '3px solid red';
  videoContainer.appendChild(warningBanner);
  
  // Explicitly add click event listeners after the banner is in the DOM
  setTimeout(() => {
    const realBtn = warningBanner.querySelector('.real-btn');
    const fakeBtn = warningBanner.querySelector('.fake-btn');
    const feedbackStatus = warningBanner.querySelector('.feedback-status');
    const feedbackButtons = warningBanner.querySelector('.feedback-buttons');
    
    if (realBtn) {
      realBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Real button clicked');
        submitFeedback(window.location.href, 'REAL');
        showFeedbackConfirmation();
        return false;
      };
    }
    
    if (fakeBtn) {
      fakeBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Fake button clicked');
        submitFeedback(window.location.href, 'FAKE');
        showFeedbackConfirmation();
        return false;
      };
    }
    
    function showFeedbackConfirmation() {
      feedbackButtons.style.display = 'none';
      feedbackStatus.style.display = 'block';
    }
  }, 100);
  
  video.addEventListener('play', () => {
    warningBanner.style.display = 'block';
  });
}

// Function to submit user feedback
function submitFeedback(videoUrl, feedback) {
  console.log(`Submitting feedback: ${feedback} for ${videoUrl}`);
  
  const formData = new FormData();
  formData.append('video_url', videoUrl);
  formData.append('feedback', feedback);
  
  fetch('http://127.0.0.1:8000/video/api/feedback', {
    method: 'POST',
    body: formData,
  })
    .then(response => response.json())
    .then(data => {
      console.log('Feedback response:', data);
    })
    .catch(error => {
      console.error('Error submitting feedback:', error);
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