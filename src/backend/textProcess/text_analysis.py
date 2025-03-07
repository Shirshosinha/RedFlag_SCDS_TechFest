import spacy
import re
import requests
import logging
import openai
import urllib.parse
from transformers import pipeline
from bs4 import BeautifulSoup

# ==================== CONFIGURATIONS ====================


BIAS_THRESHOLD = 0.3  


GROQ_API_KEY = "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"
GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

# Load NLP Model
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    logging.warning("SpaCy model not found; run: python -m spacy download en_core_web_sm")
    nlp = None

# Load Bias Detection Model
bias_model = pipeline(
    "text-classification",
    model="cardiffnlp/twitter-roberta-base-sentiment",
    top_k=None  # ✅ This ensures all labels are returned
)

# ==================== UTILITY FUNCTIONS ====================

def preprocess_text(text: str) -> str:
    """Clean text and remove unnecessary filler phrases."""
    return re.sub(r"\s+", " ", text.strip()).lower()

def segment_sentences(text: str) -> list:
    """Split text into meaningful sentences using SpaCy, with a fallback method."""
    if not nlp:
        return [sent.strip() for sent in re.split(r'(?<=[.!?])\s+', text) if sent.strip()]  # Basic regex fallback
    return [sent.text.strip() for sent in nlp(text).sents if len(sent.text.strip()) > 3]

import re

def smart_segment_paragraphs(text: str) -> list:
    """Automatically splits text into logical paragraphs based on sentence structure."""
    sentences = re.split(r'(?<=[.!?])\s+', text)  # ✅ Split at sentence boundaries
    paragraphs = []
    temp_paragraph = []

    for sentence in sentences:
        temp_paragraph.append(sentence)

        # ✅ Define when to start a new paragraph:
        if len(" ".join(temp_paragraph)) > 500 or (sentence.endswith((".", "?", "!")) and len(temp_paragraph) > 1):
            paragraphs.append(" ".join(temp_paragraph))
            temp_paragraph = []

    if temp_paragraph:  # ✅ Add any remaining sentences as the last paragraph
        paragraphs.append(" ".join(temp_paragraph))

    return paragraphs


def get_related_news_articles(query: str, excluded_domain: str, num_results=2) -> list:
    """Fetch relevant news articles using Google Search, excluding sources from the same domain as the current page."""
    from googlesearch import search  # ✅ Google Search Library

    try:
        # ✅ Get top 5 Google search results
        search_results = list(search(query, num_results=num_results, lang="en"))
        logging.info(f"[INFO] Google Search URLs: {search_results}")

        articles = []
        for url in search_results:
            article_domain = extract_domain(url)

            # ✅ Ensure the source is NOT from the same domain
            if article_domain == excluded_domain:
                logging.warning(f"[WARNING] Skipping {url} as it is from the excluded domain {excluded_domain}.")
                continue  # Skip this source

            full_text = fetch_article_content(url)
            if full_text:
                articles.append({"title": url, "url": url, "content": full_text})

        return articles  # ✅ Return only filtered external articles

    except Exception as e:
        logging.error(f"[ERROR] Failed to fetch Google search results: {e}")
        return []

# 3️⃣ **Bias Detection**
def detect_bias(sentence: str, threshold: float = BIAS_THRESHOLD) -> dict:
    """Detect bias in a sentence using RoBERTa-based sentiment analysis."""
    cleaned = preprocess_text(sentence)
    if len(cleaned) < 3:
        return {}

    prediction_list = bias_model(cleaned)[0]
    neg_dict = next((item for item in prediction_list if item["label"] == "LABEL_0"), None)
    
    if not neg_dict:
        return {}

    neg_score = neg_dict["score"]
    logging.debug(f"Bias Check: '{sentence}' => LABEL_0 Score: {neg_score:.2f}")

    if neg_score > threshold:
        return {sentence: round(neg_score, 2)}

    return {}
import requests
import logging
# ✅ Load sentence similarity model
def fetch_article_content(url: str) -> dict:
    """Scrape and extract main article title and first 500 words from a given URL."""
    try:
        headers = {"User-Agent": "Mozilla/5.0"}  # ✅ Prevent bot detection
        response = requests.get(url, timeout=10, headers=headers)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        # ✅ Extract title of the article
        title = soup.title.string.strip() if soup.title else "No Title Available"

        # ✅ Extract main content using HTML tags
        article_text = ""
        for tag in ["p", "div", "article"]:
            elements = soup.find_all(tag)
            for el in elements:
                text = el.get_text().strip()
                if len(text) > 100:  # ✅ Ignore short elements
                    article_text += text + " "

        # ✅ Keep only the first 500 words of the extracted content
        words = article_text.split()
        truncated_content = " ".join(words[:500])  # ✅ Get first 500 words

        # ✅ Ensure the text is readable
        if len(truncated_content) < 100:
            return {"title": title, "content": "Content not available"}
        
        return {"title": title, "content": truncated_content}

    except Exception as e:
        logging.error(f"[ERROR] Failed to scrape {url}: {e}")
        return {"title": "Error", "content": "Content not available"}


# ✅ Load sentence similarity model
def verify_misinformation_with_llm(claim: str, related_articles: list) -> dict:
    """Use Groq Llama 3.1-70B to determine misinformation based on web-scraped articles."""
    enriched_articles = []
    
    print("\n===== Extracted Articles (Title + First 500 Words) =====\n")

    for article in related_articles:
        extracted_data = fetch_article_content(article["url"])  # ✅ Get title + first 500 words
        title = extracted_data["title"]
        content = extracted_data["content"]

        logging.debug(f"[DEBUG] Extracted Article: {title} -> {len(content.split())} words")

        # ✅ Print extracted content
        print(f"🔹 **Title:** {title}\n📎 **URL:** {article['url']}\n📝 **Content (First 500 words):**\n{content}\n{'-'*80}")

        enriched_articles.append({
            "title": title,
            "content": content,
            "url": article["url"]
        })

    # ✅ Format selected articles for Llama 3.1
    context = "\n\n".join([f"- {a['title']} ({a['url']}): {a['content']}" for a in enriched_articles])

    logging.debug(f"[DEBUG] Formatted Context for Llama 3.1 Analysis: {len(context)} chars")

    prompt = f"""
    You are an AI misinformation fact-checker. Analyze the claim below using the provided web articles.

    **CLAIM**: "{claim}"

    **SCRAPED ARTICLES**:
    {context}

    **Instructions**:
    - If the claim is **supported by sources**, classify it as: **✅ TRUE**
    - If the claim is **contradicted by sources**, classify it as: **❌ FALSE**
    - If no direct evidence is found, classify as: **🤷 NO EVIDENCE**
    """

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "llama3-70b-8192",
        "messages": [{"role": "user", "content": prompt}]
    }

    try:
        response = requests.post(GROQ_ENDPOINT, headers=headers, json=payload)
        response.raise_for_status()
        result = response.json()
        logging.debug(f"[DEBUG] Llama 3.1 Response: {result}")

        return {"Misinformation Verdict": result["choices"][0]["message"]["content"]}

    except requests.RequestException as e:
        logging.error(f"Error querying Groq: {e}")
        return {"Misinformation Verdict": "Unable to process fact-checking due to API failure."}

import time

openai_call_cache = {}

def fact_check_claim(paragraph: str, excluded_domain: str) -> dict:
    """Paraphrase sentence, fetch Google search results (excluding current page's domain), and check for misinformation."""
    cleaned_paragraph = preprocess_text(paragraph)
    logging.debug(f"[DEBUG] Cleaned Paragraph: {cleaned_paragraph}")

    if len(cleaned_paragraph) < 3:
        return {"Fact-Check Result": "Unknown", "Explanation": "Sentence is too short for analysis"}

    # ✅ Step 1: Generate better search query
    try:
        optimized_query = cleaned_paragraph
        logging.debug(f"[DEBUG] Optimized Search Query: {optimized_query}")
    except Exception as e:
        logging.error(f"Error in paraphrasing: {e}")
        return {"Fact-Check Result": "Error", "Explanation": "API Error during paraphrasing"}

    # ✅ Step 2: Fetch relevant news articles from the web (EXCLUDING the current page's domain)
    related_articles = get_related_news_articles(optimized_query, excluded_domain)
    logging.debug(f"[DEBUG] Retrieved {len(related_articles)} Articles")

    if not related_articles:
        logging.warning(f"[WARNING] No external articles found for query: {optimized_query}")
        return {"Fact-Check Result": "NO EVIDENCE", "Explanation": "No independent sources found."}

    # ✅ Step 3: Analyze with Groq Llama 3.1
    try:
        result = verify_misinformation_with_llm(cleaned_paragraph, related_articles)
        logging.debug(f"[DEBUG] Misinformation Verdict: {result}")
    except Exception as e:
        logging.error(f"Error in misinformation analysis: {e}")
        result = {"Fact-Check Result": "Error", "Explanation": "API Error during verification"}

    return result


from urllib.parse import urlparse

def extract_domain(url: str) -> str:
    """Extracts the domain from a given URL (removes www.)."""
    try:
        parsed_url = urlparse(url)
        return parsed_url.netloc.replace("www.", "")  # ✅ Normalize domain name
    except Exception as e:
        logging.error(f"[ERROR] Failed to extract domain from {url}: {e}")
        return ""



# 6️⃣ **Process Full Text**
def analyze_text(raw_text: str, current_page_url: str) -> dict:
    """Analyze bias per sentence and misinformation per paragraph while avoiding self-referential results."""
    
    # ✅ Extract domain from the current page URL (from extension)
    excluded_domain = extract_domain(current_page_url)
    logging.info(f"[INFO] Excluding sources from the current page domain: {excluded_domain}")

    sentences = segment_sentences(raw_text)  # ✅ Split into sentences
    paragraphs = smart_segment_paragraphs(raw_text)  # ✅ Split into paragraphs

    bias_results = {}  # Store bias results per sentence
    misinformation_results = {}  # Store misinformation results per paragraph

    # ✅ Process Bias Detection (Per Sentence)
    for sentence in sentences:
        logging.info(f"Processing Bias Detection: {sentence}")

        bias_result = detect_bias(sentence, threshold=BIAS_THRESHOLD)
        if bias_result:  # ✅ Only store if bias is detected
            bias_results[sentence] = bias_result[sentence]  

    # ✅ Process Misinformation Detection (Per Paragraph)
    for paragraph in paragraphs:
        logging.info(f"Processing Misinformation Detection: {paragraph}")

        misinformation_result = fact_check_claim(paragraph, excluded_domain)

        # ✅ Ensure we store only the "Misinformation Verdict"
        if "Misinformation Verdict" in misinformation_result:
            misinformation_results[paragraph] = misinformation_result["Misinformation Verdict"]
        else:
            logging.warning(f"[WARNING] No misinformation verdict found for: {paragraph}")

    return {
        "biased_sentences": bias_results,  # ✅ Bias detection per sentence
        "misinformation_sentences": misinformation_results  # ✅ Misinformation detection per paragraph
    }