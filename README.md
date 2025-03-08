# Red-Flag : Browser Extension (Your Online Bullsh*t Detecter)

## 🔥 Overview
**Red-Flag** is a powerful browser extension designed to combat misinformation and ensure the integrity of online content. This extension employs advanced AI technologies to detect **deepfake videos**, **check facts in real-time**, **analyze sentiment for bias detection**, and **create a community-driven fact-checking ecosystem** where users can contribute insights. 

The **Red-Flag Extension** works by integrating the **GenConViT - Generative Convolutional Vision Transformer** model for deepfake detection, **Google Search API & Llama3.1** for misinformation verification, and community insights powered by **Snowflake Cortex AI**, and lastly **RoBERTa sentiment analysis(Twitter's Sentiment Model)** for bias detection. 

---

## 🚀 Features

### 🎥 Deepfake Detection
- Leverages the **GenConViT model** (a hybrid convolutional-transformer architecture).
- Analyzes videos to determine **authenticity and detect deepfakes**.
- Our proposed model addresses the challenge of generalizability in deepfake detection by leveraging **visual and latent features** and providing an effective solution for 
  identifying a wide range of fake videos while preserving media integrity.
- Works on embedded videos from various platforms like **Youtube, Twitter, Tik-Tok, Instagram(Web), Telegram** when opened through Google Chrome.

This is an example of a deepfake which has been detected through the Red Flag Extension.

https://github.com/user-attachments/assets/d8580074-58d4-4cec-b6ce-c0111203f1df

### 🤝 Community Driven Fact Checking
- Allows users to engage in discussions about flagged content while leveraging **AI-powered insights - Snowflake Cortex AI** to understand the overall sentiment and 
  opinions on a given news article or video.
- Users can leave comments on articles or videos detected as biased, deepfake, or misleading and the comments will be publicly visible to other users visiting the same 
  webpage.
- The extension automatically analyzes the tone and sentiment of community discussions and classifies into one of the following categories.
  
  - **Positive** – Majority trust the content.
  
  - **Neutral** – Mixed or uncertain reactions.
  
  - **Negative** – Majority suspect misinformation.
  
### 📰 Misinformation Detection
- **Uses Google Search to get the Top 5 articles related to the context of the fake news** and  relays back the context and information gathered from articles into **Llama3.1**, which thereafter classifies the news into one of the following categories. 
- Classifies claims into:
  -  **TRUE** (supported by sources)
  -  **FALSE** (contradicted by sources)
  -  **NO EVIDENCE** (no related news articles available)

### 🔴 Bias Detection

- Utilizes **Twitter's RoBERTa sentiment analysis model**.
- Detects bias in articles by analyzing sentiment.
- Highlights potential bias in the **headline and body text** of a webpage.

---

## 📁 Project Structure

```bash

Syntax_Errors_DLW/
│── src/
│   ├── backend/
│   │   ├── text_process/  # Misinformation & Bias Detection
│   │   │   ├── api.py  # FastAPI server
│   │   │   ├── text_analysis.py  # Text classification logic
│   │   ├── community/  # Community insights
│   │   │   ├── main.py  # FastAPI server
│   │   ├── video_process/  # Deepfake Detection
│   │   │   ├── GenConViT/  # Model implementation
│   │   │   ├── videoEndpoints.py  # API endpoints for video analysis
│   │   │   │── main.py
│   │   │   │── get_weights.ssh
│   ├── frontend/
│   │   ├── images/  # Extension icons and assets
│   │   ├── community.html  # UI for Community
│   │   ├── community.js  # Script to interact with web pages
│   │   ├── content.css  # Styles for the extension
│   │   ├── content.js  # Script to interact with web pages
│   │   ├── popup.html  # UI for the extension popup
│   │   ├── popup.js  # Controls popup behavior
│   │   ├── manifest.json  # Browser extension manifest

```



## 🚀 Installation

https://github.com/Shirshosinha/RedFlag_SCDS_TechFest.git

- uvicorn src.backend.community.main.py:app --reload
- uvicorn src.backend.textProcess.api.py:app --reload
- uvicorn src.backend.vdoProcess.main.py:app --reload


### Loading the Extension in Browser
1.) Open Chrome and go to chrome://extensions/.

2.) Enable Developer Mode (top right corner).

3.) Click "Load Unpacked" and select the src/frontend folder.

The **Red-Flag extension** should now be active!


## 🚀 Tech Stack
**FrontEnd :** HTML, CSS, JavaScript

**Backend :** Python, Fast API

**AI/Machine Learning:** GenConVit, Roberta, Snowflake Cortex AI

**API :** Google Search API, Llama3.1
