// let highlightsVisible = true;

// // Initialize when the page loads
// window.addEventListener('load', () => {
//   // Check if highlights should be visible (from user preferences)
//   chrome.storage.sync.get('highlightsVisible', (data) => {
//     if (data.highlightsVisible !== undefined) {
//       highlightsVisible = data.highlightsVisible;
//     }
//     analyzePageContent();
//   });
// });

// // Listen for messages from popup
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   if (request.action === 'toggleHighlights') {
//     highlightsVisible = request.visible;
//     toggleHighlightVisibility(highlightsVisible);
//     sendResponse({status: 'success'});
//   }
// });

// // Main function to analyze the page content
// async function analyzePageContent() {
//   try {
//     // 1. Extract all text content from the page
//     const pageText = extractPageText();
    
//     // 2. Find all video elements
//     const videoElements = document.querySelectorAll('video');
    
//     // 3. Send all text content to the backend for analysis
//     const textAnalysisResults = await analyzeText(pageText);
    
//     // 4. Send video URLs to the backend for deepfake detection
//     const videoAnalysisResults = await analyzeVideos(videoElements);
    
//     // 5. Highlight opinionated content based on the returned texts
//     highlightOpinionatedContent(textAnalysisResults);
    
//     // 6. Flag potential deepfake videos
//     flagDeepfakeVideos(videoAnalysisResults);
    
//     // 7. Set initial visibility based on user preference
//     toggleHighlightVisibility(highlightsVisible);
    
//   } catch (error) {
//     console.error('Error analyzing page content:', error);
//   }
// }

// // Extract all text content from the page
// function extractPageText() {
//   const textNodes = findTextNodes(document.body);
//   return {
//     fullText: document.body.innerText,
//     textNodes: textNodes.map(node => ({
//       text: node.nodeValue.trim(),
//       xpath: getXPathForElement(node)
//     })).filter(item => item.text !== '')
//   };
// }

// // Helper function to find all text nodes in the document
// function findTextNodes(node) {
//   const textNodes = [];
//   const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  
//   let currentNode;
//   while (currentNode = walker.nextNode()) {
//     // Skip empty text nodes or those in script/style tags
//     if (currentNode.nodeValue.trim() !== '' && 
//         !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(currentNode.parentNode.tagName)) {
//       textNodes.push(currentNode);
//     }
//   }
  
//   return textNodes;
// }

// // Get XPath for a node (for reliable node finding later)
// function getXPathForElement(element) {
//   // If element is a text node, get its parent element first
//   const node = element.nodeType === Node.TEXT_NODE ? element.parentNode : element;
  
//   if (node === document.body) return '/html/body';
  
//   let xpath = '';
//   let parent = node;
  
//   while (parent !== document.body && parent !== null && parent.parentNode !== null) {
//     const index = Array.from(parent.parentNode.children).indexOf(parent) + 1;
//     xpath = `/${parent.tagName.toLowerCase()}[${index}]${xpath}`;
//     parent = parent.parentNode;
//   }
  
//   return `/html/body${xpath}`;
// }

// /* ---------- Modified Text Analysis Part ---------- */

// // Send text content to the backend API for analysis
// async function analyzeText(pageTextData) {
//   try {
//     // Use the new API endpoint and payload structure (sending only "text")
//     const response = await fetch('http://127.0.0.1:8001/analyze/', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify({ 
//         text: pageTextData.fullText
//       })
//     });
    
//     if (!response.ok) {
//       throw new Error('Text analysis API request failed');
//     }
    
//     return await response.json();
//   } catch (error) {
//     console.error('Error calling text analysis API:', error);
//     // Return empty structures for both keys on error
//     return { biased_sentences: {}, misinformation_sentences: {} };
//   }
// }

// // Highlight opinionated content based on the new API response structure
// function highlightOpinionatedContent(analysisResults) {
//   if (!analysisResults) return;
  
//   // Process biased sentences: the response provides an object with each biased sentence as key and its score as value.
//   if (analysisResults.biased_sentences && typeof analysisResults.biased_sentences === 'object') {
//     const allTextNodes = findTextNodes(document.body);
//     Object.entries(analysisResults.biased_sentences).forEach(([sentence, score]) => {
//       if (!sentence) return;
      
//       const matchingNodes = allTextNodes.filter(node => node.nodeValue.includes(sentence));
//       matchingNodes.forEach(node => {
//         const parent = node.parentNode;
//         const text = node.nodeValue;
        
//         let tooltipText = 'Biased content detected';
//         if (score !== null) {
//           const scorePercent = Math.round(score * 100);
//           tooltipText += ` (${scorePercent}% confidence)`;
//         }
        
//         // If the node text exactly matches the sentence, replace the whole node
//         if (text.trim() === sentence.trim()) {
//           const highlightedText = document.createElement('span');
//           highlightedText.className = 'opinion-highlight';
//           highlightedText.title = tooltipText;
//           highlightedText.dataset.opinionScore = score !== null ? score : '';
//           highlightedText.textContent = text;
//           if (score !== null) {
//             const intensity = Math.floor(score * 100);
//             highlightedText.style.backgroundColor = `rgba(255, ${255 - intensity}, ${150 - intensity}, 0.7)`;
//           }
//           parent.replaceChild(highlightedText, node);
//         } else {
//           // If sentence is a substring of the node text, highlight just that part
//           const parts = text.split(new RegExp(`(${escapeRegExp(sentence)})`, 'g'));
//           const fragment = document.createDocumentFragment();
//           parts.forEach(part => {
//             if (part === sentence) {
//               const highlightedText = document.createElement('span');
//               highlightedText.className = 'opinion-highlight';
//               highlightedText.title = tooltipText;
//               highlightedText.dataset.opinionScore = score !== null ? score : '';
//               highlightedText.textContent = part;
//               if (score !== null) {
//                 const intensity = Math.floor(score * 100);
//                 highlightedText.style.backgroundColor = `rgba(255, ${255 - intensity}, ${150 - intensity}, 0.7)`;
//               }
//               fragment.appendChild(highlightedText);
//             } else if (part !== '') {
//               fragment.appendChild(document.createTextNode(part));
//             }
//           });
//           parent.replaceChild(fragment, node);
//         }
//       });
//     });
//   }
  
//   // Process misinformation sentences: each key is a sentence with fact-check info as its value.
//   if (analysisResults.misinformation_sentences && typeof analysisResults.misinformation_sentences === 'object') {
//     const allTextNodes = findTextNodes(document.body);
//     Object.entries(analysisResults.misinformation_sentences).forEach(([sentence, info]) => {
//       if (!sentence) return;
      
//       let tooltipText = 'Misinformation detected';
//       if (info && info["Fact-Check Matches"] && Array.isArray(info["Fact-Check Matches"])) {
//         const matches = info["Fact-Check Matches"].map(match => `${match["Claim"]} (${match["Fact-Check Result"]})`);
//         tooltipText += ": " + matches.join(", ");
//       }
      
//       const matchingNodes = allTextNodes.filter(node => node.nodeValue.includes(sentence));
//       matchingNodes.forEach(node => {
//         const parent = node.parentNode;
//         const text = node.nodeValue;
        
//         if (text.trim() === sentence.trim()) {
//           const highlightedText = document.createElement('span');
//           highlightedText.className = 'misinfo-highlight';
//           highlightedText.title = tooltipText;
//           highlightedText.textContent = text;
//           highlightedText.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
//           parent.replaceChild(highlightedText, node);
//         } else {
//           const parts = text.split(new RegExp(`(${escapeRegExp(sentence)})`, 'g'));
//           const fragment = document.createDocumentFragment();
//           parts.forEach(part => {
//             if (part === sentence) {
//               const highlightedText = document.createElement('span');
//               highlightedText.className = 'misinfo-highlight';
//               highlightedText.title = tooltipText;
//               highlightedText.textContent = part;
//               highlightedText.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
//               fragment.appendChild(highlightedText);
//             } else if (part !== '') {
//               fragment.appendChild(document.createTextNode(part));
//             }
//           });
//           parent.replaceChild(fragment, node);
//         }
//       });
//     });
//   }
// }

// // Escape special characters for RegExp
// function escapeRegExp(string) {
//   return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// }


// // Send video URLs to the backend API for deepfake detection
// // async function analyzeVideos(videoElements) {
// //   // const videoUrls = Array.from(videoElements).map(video => ({
// //   //   src: video.currentSrc || video.src,
// //   //   element: video
// //   // })); 
// //     // return { deepfakeVideos: videoUrls.map(v => v.src) };
  
// //   // if (videoUrls.length === 0) return { deepfakeVideos: [] };
// //   // try {
// //   //   const response = await fetch('https://your-backend-api.com/analyze-videos', {
// //   //     method: 'POST',
// //   //     headers: {
// //   //       'Content-Type': 'application/json'
// //   //     },
// //   //     body: JSON.stringify({ 
// //   //       url: window.location.href,
// //   //       videos: videoUrls.map(v => v.src)
// //   //     })
// //   //   });
    
// //   //   if (!response.ok) {
// //   //     throw new Error('Video analysis API request failed');
// //   //   }
    
// //   //   const result = await response.json();
    
// //   //   // Match the returned URLs with our video elements
// //   //   if (result.deepfakeVideos && Array.isArray(result.deepfakeVideos)) {
// //   //     result.deepfakeVideos = result.deepfakeVideos.map(url => {
// //   //       const videoData = videoUrls.find(v => v.src === url || url.includes(v.src));
// //   //       return {
// //   //         url: url,
// //   //         element: videoData ? videoData.element : null
// //   //       };
// //   //     }).filter(item => item.element !== null);
// //   //   }
    
// //   //   return result;
// //   // } catch (error) {
// //   //   console.error('Error calling video analysis API:', error);
// //   //   return { deepfakeVideos: [] };
// //   // }
// //   if (videoElements.length === 0) return { deepfakeVideos: [] };

// //   const videoPromises = Array.from(videoElements).map(video => {
// //     return new Promise((resolve, reject) => {
// //       // Ensure the video is playing; captureStream may not work on a paused element.
// //       if (video.paused) {
// //         video.play();
// //       }
  
// //       // Capture the stream from the video element
// //       const stream = video.captureStream();
// //       const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
// //       let chunks = [];

// //       // When data is available, store it
// //       recorder.ondataavailable = event => {
// //         if (event.data.size > 0) {
// //           chunks.push(event.data);
// //         }
// //       };

// //       // When recording stops, create a Blob and open it
// //       recorder.onstop = () => {
// //         const blob = new Blob(chunks, { type: 'video/webm' });
// //         console.log('Recorded Blob:', blob);
// //         // Create a URL for the blob and open it in a new tab to review the video
// //         // const url = URL.createObjectURL(blob);
// //         // window.open(url);
// //         const formData = new FormData();
// //         formData.append('file', blob, 'recording.webm');

// //           fetch('http://127.0.0.1:8000/api/video_predict', {
// //                 method: 'POST',
// //                 body: formData,
// //           })
// //           .then(response => response.json())
// //           .then(data => {
// //               console.log('Backend response:', data);
// //           })
// //           .catch(error => {
// //               console.error('Error sending video');
// //           });
// //       };

// //       // Start recording and stop after 10 seconds
// //       recorder.start();
// //       console.log('Recording started');
// //       setTimeout(() => {
// //         recorder.stop();
// //         console.log('Recording stopped');
// //       }, 10000);
// //     });  

// // });
// // }

// async function analyzeVideos(videoElements) {
//   if (videoElements.length === 0) {
//     console.log('No video elements found on this page.');
//     return { deepfakeVideos: [] };
//   }

//   const videoPromises = Array.from(videoElements).map((video, index) => {
//     return new Promise((resolve, reject) => {
//       // Ensure the video is playing; captureStream may not work on a paused element.
//       if (video.paused) {
//         video.play();
//       }

//       // Capture the stream from the video element
//       const stream = video.captureStream();
//       const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
//       let chunks = [];

//       // When data is available, store it
//       recorder.ondataavailable = event => {
//         if (event.data.size > 0) {
//           chunks.push(event.data);
//         }
//       };

//       // When recording stops, create a Blob and send it to the backend
//       recorder.onstop = () => {
//         const blob = new Blob(chunks, { type: 'video/webm' });
//         console.log('Recorded Blob:', blob);
//         const formData = new FormData();
//         formData.append('file', blob, `recording_${index}.webm`);

//         fetch('http://127.0.0.1:8000/video/api/video_predict', {
//           method: 'POST',
//           body: formData,
//         })
//         .then(response => response.json())
//         .then(data => {
//           console.log('Backend response:', data);
//           resolve({ video, result: data.result, accuracy: data.accuracy });
//         })
//         .catch(error => {
//           console.error('Error sending video:', error);
//           reject(error);
//         });
//       };

//       // Start recording and stop after 10 seconds
//       recorder.start();
//       console.log('Recording started for video:', video);
//       setTimeout(() => {
//         recorder.stop();
//         console.log('Recording stopped for video:', video);
//       }, 10000);
//     });
//   });

//   try {
//     const results = await Promise.all(videoPromises);
//     return { deepfakeVideos: results };
//   } catch (error) {
//     console.error('Error analyzing videos:', error);
//     return { deepfakeVideos: [] };
//   }
// }

// function flagDeepfakeVideos(analysisResults) {
//     if (!analysisResults || !analysisResults.deepfakeVideos || !Array.isArray(analysisResults.deepfakeVideos)) {
//       return;
//     }
    
//     analysisResults.deepfakeVideos.forEach(item => {
//       const videoElement = item.video;
//       const result = item.result;
//       const accuracy = item.accuracy;

//       if (result != "FAKE") return;

//       if (!videoElement) return;

//       if (videoElement.hasAttribute('data-deepfake-flagged')) {
//         return;
//       }

//       videoElement.setAttribute('data-deepfake-flagged', 'true');
//       let videoContainer = videoElement.parentNode;
//       const videoComputedStyle = window.getComputedStyle(videoElement);

      
//       // if (typeof item === 'object' && item.element) {
//       //   videoElement = item.element;
//       // } else if (typeof item === 'object' && item.url) {
//       //   videoElement = Array.from(document.querySelectorAll('video')).find(
//       //     video => video.src === item.url || video.currentSrc === item.url
//       //   );
//       // } else if (typeof item === 'string') {
//       //   videoElement = Array.from(document.querySelectorAll('video')).find(
//       //     video => video.src === item || video.currentSrc === item
//       //   );
//       // }
      
//       // if (!videoElement) return;
      
//       // if (videoElement.hasAttribute('data-deepfake-flagged')) {
//       //   return;
//       // }
      
//       // videoElement.setAttribute('data-deepfake-flagged', 'true');
      
//       // const confidence = typeof item === 'object' && item.confidence 
//       //   ? item.confidence 
//       //   : null;
      
//       // let videoContainer = videoElement.parentNode;
//       // const videoComputedStyle = window.getComputedStyle(videoElement);
      
//       if (videoComputedStyle.position === 'static' || 
//           window.getComputedStyle(videoContainer).position === 'static') {
//         const wrapper = document.createElement('div');
//         wrapper.className = 'deepfake-video-container';
//         wrapper.style.position = 'relative';
//         wrapper.style.display = 'inline-block';
//         wrapper.style.width = videoElement.offsetWidth + 'px';
//         wrapper.style.height = videoElement.offsetHeight + 'px';
//         videoElement.parentNode.insertBefore(wrapper, videoElement);
//         wrapper.appendChild(videoElement);
//         videoContainer = wrapper;
//       } else {
//         videoContainer.style.position = 'relative';
//       }
      
//       const warningBanner = document.createElement('div');
//       warningBanner.className = 'deepfake-warning';
      
//       let warningText = '⚠️ Potential deepfake video detected';
//       if (confidence !== null) {
//         const confidencePercent = Math.round(confidence * 100);
//         warningText += ` (${confidencePercent}% confidence)`;
//       }
      
//       warningBanner.innerHTML = warningText;
//       videoElement.style.border = '3px solid red';
//       videoContainer.appendChild(warningBanner);
      
//       videoElement.addEventListener('play', function() {
//         warningBanner.style.display = 'block';
//       });
//     });
// }

// function toggleHighlightVisibility(visible) {
//     const opinionHighlights = document.querySelectorAll('.opinion-highlight');
//     const deepfakeWarnings = document.querySelectorAll('.deepfake-warning');
    
//     opinionHighlights.forEach(highlight => {
//       if (visible) {
//         const score = parseFloat(highlight.dataset.opinionScore);
//         if (!isNaN(score)) {
//           const intensity = Math.floor(score * 100);
//           highlight.style.backgroundColor = `rgba(255, ${255 - intensity}, ${150 - intensity}, 0.7)`;
//         } else {
//           highlight.style.backgroundColor = 'rgba(255, 221, 158, 0.7)';
//         }
//         highlight.style.color = '';
//       } else {
//         highlight.style.backgroundColor = 'transparent';
//         highlight.style.color = '';
//       }
//     });
    
//     deepfakeWarnings.forEach(warning => {
//       warning.style.display = visible ? 'block' : 'none';
//     });
// }



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
  
  if (analysisResults.biased_sentences && typeof analysisResults.biased_sentences === 'object') {
    const allTextNodes = findTextNodes(document.body);
    Object.entries(analysisResults.biased_sentences).forEach(([sentence, score]) => {
      if (!sentence) return;
      const matchingNodes = allTextNodes.filter(node => node.nodeValue.includes(sentence));
      matchingNodes.forEach(node => {
        const parent = node.parentNode;
        const text = node.nodeValue;
        let tooltipText = 'Biased content detected';
        if (score !== null) {
          tooltipText += ` (${Math.round(score * 100)}% confidence)`;
        }
        if (text.trim() === sentence.trim()) {
          const highlightedText = document.createElement('span');
          highlightedText.className = 'opinion-highlight';
          highlightedText.title = tooltipText;
          highlightedText.dataset.opinionScore = score !== null ? score : '';
          highlightedText.textContent = text;
          if (score !== null) {
            const intensity = Math.floor(score * 100);
            highlightedText.style.backgroundColor = `rgba(255, ${255 - intensity}, ${150 - intensity}, 0.7)`;
          }
          parent.replaceChild(highlightedText, node);
        } else {
          const parts = text.split(new RegExp(`(${escapeRegExp(sentence)})`, 'g'));
          const fragment = document.createDocumentFragment();
          parts.forEach(part => {
            if (part === sentence) {
              const highlightedText = document.createElement('span');
              highlightedText.className = 'opinion-highlight';
              highlightedText.title = tooltipText;
              highlightedText.dataset.opinionScore = score !== null ? score : '';
              highlightedText.textContent = part;
              if (score !== null) {
                const intensity = Math.floor(score * 100);
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
  
  if (analysisResults.misinformation_sentences && typeof analysisResults.misinformation_sentences === 'object') {
    const allTextNodes = findTextNodes(document.body);
    Object.entries(analysisResults.misinformation_sentences).forEach(([sentence, info]) => {
      if (!sentence) return;
      let tooltipText = 'Misinformation detected';
      if (info && info["Fact-Check Matches"] && Array.isArray(info["Fact-Check Matches"])) {
        const matches = info["Fact-Check Matches"].map(match => `${match["Claim"]} (${match["Fact-Check Result"]})`);
        tooltipText += ": " + matches.join(", ");
      }
      const matchingNodes = allTextNodes.filter(node => node.nodeValue.includes(sentence));
      matchingNodes.forEach(node => {
        const parent = node.parentNode;
        const text = node.nodeValue;
        if (text.trim() === sentence.trim()) {
          const highlightedText = document.createElement('span');
          highlightedText.className = 'misinfo-highlight';
          highlightedText.title = tooltipText;
          highlightedText.textContent = text;
          highlightedText.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
          parent.replaceChild(highlightedText, node);
        } else {
          const parts = text.split(new RegExp(`(${escapeRegExp(sentence)})`, 'g'));
          const fragment = document.createDocumentFragment();
          parts.forEach(part => {
            if (part === sentence) {
              const highlightedText = document.createElement('span');
              highlightedText.className = 'misinfo-highlight';
              highlightedText.title = tooltipText;
              highlightedText.textContent = part;
              highlightedText.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
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

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ---------- Modified Video Analysis Part: Continuous 20-second Chunks with Play Event ---------- */

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

function toggleHighlightVisibility(visible) {
  const opinionHighlights = document.querySelectorAll('.opinion-highlight');
  const deepfakeWarnings = document.querySelectorAll('.deepfake-warning');
  
  opinionHighlights.forEach(highlight => {
    if (visible) {
      const score = parseFloat(highlight.dataset.opinionScore);
      if (!isNaN(score)) {
        const intensity = Math.floor(score * 100);
        highlight.style.backgroundColor = `rgba(255, ${255 - intensity}, ${150 - intensity}, 0.7)`;
      } else {
        highlight.style.backgroundColor = 'rgba(255, 221, 158, 0.7)';
      }
      highlight.style.color = '';
    } else {
      highlight.style.backgroundColor = 'transparent';
      highlight.style.color = '';
    }
  });
  
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