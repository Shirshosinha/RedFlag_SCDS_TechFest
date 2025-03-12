import spacy
import re
import requests
import logging
import openai
import urllib.parse
from transformers import pipeline
from bs4 import BeautifulSoup
from newspaper import Article
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


def get_related_news_articles(query: str, excluded_domain: str, num_results=3) -> list:
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

import json

def analyze_threat_of_misinformation(misinformed_claims: list):
    """Aggregates multiple misinformation claims into a single LLM request for holistic threat analysis with reasoning."""

    if not misinformed_claims:
        return {"error": "No misinformation claims provided for analysis."}

    combined_claims = "\n".join([f"- {claim}" for claim in misinformed_claims])

    prompt = f"""
    You are an expert misinformation analyst. Below is a collection of misinformation claims detected in an article.

    **Misinformation Claims Detected:**
    {combined_claims}

    **Analyze the overall impact of these claims and return the response in JSON format ONLY. Do NOT include explanations outside JSON.**

    JSON Output MUST follow this structure:
    {{
        "threat_score": an integer between 1-10 (low = 1, high = 10),
        "threat_industries":"One Industry that might be most affected by this misinformation",
        "historical_risk": an integer (0 if no historical relevance, otherwise between 1-10),
        "qualitative_analysis": "A very small brief explanation of the threat level and potential impact. Try to give one historical example of something like this happening in the past."
    }}
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

        # ✅ Fix: Force JSON validation
        try:
            threat_data = json.loads(result["choices"][0]["message"]["content"].strip())
        except json.JSONDecodeError:
            logging.error("[ERROR] Groq LLM returned non-JSON format. Check LLM output.")
            return {"error": "Threat analysis response is not in JSON format"}

        return threat_data  # ✅ Now we return LLM-generated JSON directly

    except requests.RequestException as e:
        logging.error(f"Error querying Groq for threat analysis: {e}")
        return {"error": "Unable to assess threat level due to API failure."}
    

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
    You are an AI misinformation fact-checker. Analyze the claim below using the provided web articles. Your output will be displayed direfctly on a browser.
    Keep it VERY short and concise.

    **CLAIM**: "{claim}"

    **SCRAPED ARTICLES**:
    {context}

    **Instructions**:
    - If the claim is **supported by sources**, classify it as: **✅ TRUE**
    - If the claim is **contradicted by sources**, classify it as: **❌ FALSE**
    - If no direct evidence is found, classify as: **🤷 NO EVIDENCE**

    Put your classification at the very top of the answer, followed by a brief explanation. Follow this format:
    'TRUE/FALSE/NO EVIDENCE: Very small explanation.'
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
    related_articles = get_related_news_articles(preprocess_text(paragraph), excluded_domain)
    if not related_articles:
        return {"classification": "NO EVIDENCE", "explanation": "No independent sources found.", "sources": []}
    result = verify_misinformation_with_llm(paragraph, related_articles)
    if "TRUE" in result["Misinformation Verdict"]:
        return
    if "FALSE" in result["Misinformation Verdict"]:
        return {
        "text": paragraph,
        "classification": "FALSE",
        "explanation": result["Misinformation Verdict"][9:],
        "sources": [{"title": a["title"], "url": a["url"], "verdict": "External Source"} for a in related_articles]
    }
    else:
        return {
        "text": paragraph,
        "classification": "NO EVIDENCE",
        "explanation" : "No credible sources have confirmed this information.",
        "sources" : []
        }


from urllib.parse import urlparse

def extract_domain(url: str) -> str:
    """Extracts the domain from a given URL (removes www.)."""
    try:
        parsed_url = urlparse(url)
        return parsed_url.netloc.replace("www.", "")  # ✅ Normalize domain name
    except Exception as e:
        logging.error(f"[ERROR] Failed to extract domain from {url}: {e}")
        return ""

def analyze_text(current_page_url: str) -> dict:
    """Processes text for bias detection, misinformation detection, and a single threat analysis with reasoning."""

    excluded_domain = extract_domain(current_page_url)
    article = Article(current_page_url)
    article.download()
    article.parse()
    raw_text = article.title + "\n" + article.text
    sentences = segment_sentences(raw_text)
    paragraphs = raw_text.split("\n")
    biased_sentences = [detect_bias(sent) for sent in sentences if detect_bias(sent)]
    misinformation_sentences = []

    for para in paragraphs:
        if len(para) > 3:
            claim = fact_check_claim(para, excluded_domain)
            if claim:
                misinformation_sentences.append(claim)

    # ✅ Aggregate all misinformation statements for a single threat analysis
    misinformation_texts = [claim["text"] for claim in misinformation_sentences if "text" in claim]

    # ✅ If we have misinformation, analyze all of them together
    threat_analysis = analyze_threat_of_misinformation(misinformation_texts) if misinformation_texts else None

    # ✅ Assign the correct threat analysis to the final output
    return {
        "biased_sentences": biased_sentences,
        "misinformation_sentences": misinformation_sentences,
        "threat_analysis": threat_analysis  # ✅ Now includes reasoning
    }