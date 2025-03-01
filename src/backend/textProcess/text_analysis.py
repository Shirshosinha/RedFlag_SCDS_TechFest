import spacy
import re
import requests
import logging
import openai
import urllib.parse
from transformers import pipeline
from sentence_transformers import SentenceTransformer, util
from langchain_openai import ChatOpenAI

# ==================== CONFIGURATIONS ====================

NEWS_API_KEY = "a5285eeb839446489e6669bd52152d9c"  # ✅ Replace with your NewsAPI key
NEWS_API_URL = "https://newsapi.org/v2/everything"

BIAS_THRESHOLD = 0.3  

OPENAI_API_KEY = "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"  # ✅ Replace with your OpenAI key
openai_client = openai.OpenAI(api_key=OPENAI_API_KEY)  # ✅ Initialize OpenAI Client

# Initialize GPT-4 via LangChain
llm = ChatOpenAI(openai_api_key=OPENAI_API_KEY, model_name="gpt-4")

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
    """Use SpaCy to split text into meaningful sentence chunks."""
    if not nlp:
        return [sent.strip() for sent in text.split(".") if sent.strip()]  # Basic fallback
    return [sent.text.strip() for sent in nlp(text).sents if len(sent.text.strip()) > 3]

# 1️⃣ **Paraphrase for Better Search Queries (GPT-4)**
def paraphrase_for_search(sentence: str) -> str:
    """Use GPT-4 to rephrase a sentence for better News API search queries."""
    prompt = f"""
    Convert the following statement into a concise, keyword-based, and effective search query suitable for a news search engine.
    
    Original statement: "{sentence}"

    Optimized Search Query:
    """
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an AI that generates optimized search queries."},
                {"role": "user", "content": prompt}
            ]
        )
        optimized_query = response.choices[0].message.content.strip()
        
        # ✅ Log the generated query
        logging.info(f"[DEBUG] Optimized Search Query: {optimized_query}")
        return optimized_query
    except Exception as e:
        logging.error(f"Error in paraphrasing: {e}")
        return sentence  # Return original if error occurs

# 2️⃣ **Search News API for Related Articles**
def get_related_news_articles(query: str, num_results=10) -> list:
    """Fetch relevant news articles using the News API."""
    
    # ✅ Ensure query is URL-encoded
    encoded_query = urllib.parse.quote(query)
    
    request_url = f"{NEWS_API_URL}?q={encoded_query}&apiKey={NEWS_API_KEY}&language=en&sortBy=relevancy&pageSize={num_results}"
    logging.info(f"[API CALL] Requesting NewsAPI: {request_url}")
    
    try:
        response = requests.get(request_url)
        response.raise_for_status()
        
        # ✅ Print full API response for debugging
        api_response = response.json()
        logging.info(f"[API RESPONSE] {api_response}")
        
        articles = api_response.get("articles", [])
        
        if not articles:
            logging.warning(f"[WARNING] No news articles found for query: {query}")
            
            # ✅ **Fallback Attempt with a Broader Query**
            alternative_query = "COVID-19 vaccine safety research"
            logging.info(f"[INFO] Retrying NewsAPI search with broader query: {alternative_query}")
            return get_related_news_articles(alternative_query, num_results)

        return [{"title": article["title"], "url": article["url"], "content": article.get("content", "")} for article in articles]
    
    except requests.RequestException as e:
        logging.error(f"Error fetching news articles: {e}")
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

# 4️⃣ **Misinformation Detection (GPT-4)**
def verify_misinformation_with_llm(claim: str, related_articles: list) -> dict:
    """Use GPT-4 to determine if a claim is misinformation based on news articles."""
    
    context = "\n\n".join([f"- {article['title']}: {article['content']}" for article in related_articles])

    prompt = f"""
    You are an AI misinformation fact-checker. Analyze the claim below using the provided news articles.
    
    CLAIM: "{claim}"
    
    RELATED ARTICLES:
    {context}
    
    Classify the claim as:
    - ✅ TRUE (supported by sources)
    - ❌ FALSE (contradicted by sources)
    - ⚠️ MISLEADING (partially true, exaggerated, or lacks full context)
    - 🤷 NO EVIDENCE (no related news articles available)
    
    Provide a brief explanation and cite sources.
    """
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a misinformation fact-checking AI."},
                {"role": "user", "content": prompt}
            ]
        )
        return {"Misinformation Verdict": response.choices[0].message.content}
    except Exception as e:
        logging.error(f"Error querying GPT-4: {e}")
        return {"Misinformation Verdict": "Unable to process fact-checking due to API failure."}

# 5️⃣ **Misinformation Detection Pipeline**
def fact_check_claim(sentence: str) -> dict:
    """Paraphrase sentence, fetch news, and check for misinformation."""
    cleaned_sentence = preprocess_text(sentence)
    if len(cleaned_sentence) < 3:
        return {"Fact-Check Result": "Unknown", "Explanation": "Sentence is too short for analysis"}

    # Step 1: Generate better search query
    optimized_query = paraphrase_for_search(cleaned_sentence)

    # Step 2: Fetch relevant news articles
    related_articles = get_related_news_articles(optimized_query)

    if not related_articles:
        return {"Fact-Check Result": "NO EVIDENCE", "Explanation": "No relevant news articles found."}

    # Step 3: Analyze with GPT-4
    verdict = verify_misinformation_with_llm(cleaned_sentence, related_articles)

    return {"Fact-Check Verdict": verdict, "Related Articles": related_articles}

# 6️⃣ **Process Full Text**
def analyze_text(raw_text: str) -> dict:
    """Analyze text for bias and misinformation."""
    sentences = segment_sentences(raw_text)
    bias_results = {}
    misinformation_results = {}

    for sentence in sentences:
        logging.info(f"Processing: {sentence}")

        # Bias Detection
        bias_result = detect_bias(sentence, threshold=BIAS_THRESHOLD)
        if bias_result:
            bias_results.update(bias_result)
            
        # Misinformation Detection
        misinformation_result = fact_check_claim(sentence)
        
        if "Fact-Check Verdict" in misinformation_result:
            misinformation_results[sentence] = misinformation_result

    return {
        "biased_sentences": bias_results,
        "misinformation_sentences": misinformation_results
    }

# ==================== EXECUTION ====================

if __name__ == "__main__":
    test_paragraph = """Covid vaccines cause autism. The moon landing was fake."""
    logging.info(f"Analyzing paragraph: {test_paragraph}")
    results = analyze_text(test_paragraph)
    logging.info(f"Final results: {results}")
