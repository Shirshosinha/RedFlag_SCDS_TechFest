import spacy
import re
import requests
import logging
from transformers import pipeline
from sentence_transformers import SentenceTransformer, util

# ==================== CONFIGURATIONS ====================

FACT_CHECK_API_KEY = "AIzaSyBYTcQ0VgVEIOv8Pzw4f9476CPdWsL19Ug"  # <-- Replace this
FACT_CHECK_API_URL = f"https://factchecktools.googleapis.com/v1alpha1/claims:search?key={FACT_CHECK_API_KEY}"

# Lowered similarity threshold for better misinformation detection
SIMILARITY_THRESHOLD = 0.3  

# Negative sentiment threshold for bias detection
BIAS_THRESHOLD = 0.3  

# Sentence Transformer models for similarity matching
similarity_models = [
    SentenceTransformer('all-MiniLM-L6-v2'),
    SentenceTransformer('multi-qa-mpnet-base-dot-v1')
]

# Stop words that weaken claim matching
FILLER_PHRASES = ["i believe", "i think", "i feel"]

# Categories that indicate misinformation
MISINFO_CATEGORIES = ["False", "Partially False", "Misleading", "Incorrect", "Unsupported"]

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# ==================== LOAD MODELS ====================
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    logging.warning("SpaCy model not found; run: python -m spacy download en_core_web_sm")
    nlp = None

# Load bias detection model
bias_model = pipeline(
    "text-classification",
    model="cardiffnlp/twitter-roberta-base-sentiment",
    return_all_scores=True
)

# ==================== UTILITY FUNCTIONS ====================

def preprocess_text(text: str) -> str:
    """Clean text and remove filler phrases."""
    text = re.sub(r"\s+", " ", text.strip()).lower()
    for filler in FILLER_PHRASES:
        text = text.replace(filler, "")
    return text.strip()

def compute_similarity(text1: str, text2: str) -> float:
    """Compute sentence similarity using multiple models and return the highest score."""
    scores = []
    for model in similarity_models:
        embeddings1 = model.encode(text1, convert_to_tensor=True)
        embeddings2 = model.encode(text2, convert_to_tensor=True)
        similarity_score = util.pytorch_cos_sim(embeddings1, embeddings2).item()
        scores.append(similarity_score)
    
    return max(scores)  # Use the highest similarity score

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

def fact_check_claim(sentence: str) -> str:
    """Query the Fact-Check API and return the closest matching misinformation claim."""
    cleaned_sentence = preprocess_text(sentence)
    if len(cleaned_sentence) < 3:
        return "Unknown"

    response = requests.get(f"{FACT_CHECK_API_URL}&query={cleaned_sentence}")
    data = response.json()
    
    # Log the entire API response for debugging
    logging.debug(f"API Response: {data}")

    if "claims" not in data or not data["claims"]:
        return "No relevant fact-check found"

    best_match = None
    highest_score = 0
    found_ratings = []

    for claim in data["claims"]:
        claim_text = claim.get("text", "").lower()
        similarity = compute_similarity(cleaned_sentence, claim_text)
        logging.debug(f"Similarity: '{cleaned_sentence}' <-> '{claim_text}' => {similarity:.2f}")

        if similarity > highest_score:
            highest_score = similarity
            best_match = claim

        if similarity < SIMILARITY_THRESHOLD:
            continue

        for review in claim.get("claimReview", []):
            rating = review.get("textualRating", "Unknown")
            source = review.get("publisher", {}).get("name", "Unknown Source")
            url = review.get("url", "#")

            found_ratings.append((claim_text, rating, similarity, source, url))
            logging.debug(f"Fact-Check Match: '{claim_text}' => Rating: {rating} (Source: {source})")

    if not found_ratings:
        return "No strong misinformation matches found"

    # Sort by highest similarity score
    found_ratings.sort(key=lambda x: x[2], reverse=True)

    best_claim_text, best_rating, best_score, best_source, best_url = found_ratings[0]
    return {
        "Fact-Check Result": best_rating,
        "Source": best_source,
        "URL": best_url
    }

def segment_sentences(text: str) -> list:
    """Use spaCy to split text into meaningful sentences."""
    if nlp:
        return [sent.text.strip() for sent in nlp(text).sents if len(sent.text.strip()) > 3]
    else:
        return text.split(".")  # Fallback if spaCy is unavailable

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
        if isinstance(misinformation_result, dict) and "Fact-Check Result" in misinformation_result:
            misinformation_results[sentence] = misinformation_result
            logging.info(f"[MISINFO] '{sentence}' => {misinformation_result}")
        else:
            logging.info(f"[INFO] No misinformation detected for: {sentence}")

    return {
        "biased_sentences": bias_results,
        "misinformation_sentences": misinformation_results
    }

# ==================== EXECUTION ====================

if __name__ == "__main__":
    test_paragraph = """
            Recent studies suggest that Covid vaccines are completely unsafe and have caused severe side effects in most individuals. 
            Despite this, the mainstream media refuses to report the truth, as big pharma companies have paid millions to silence journalists. 
            Additionally, many independent researchers have found that 5G radiation weakens the immune system and is being used for mass surveillance. 
            Meanwhile, government officials have quietly admitted that the Earth is actually flat, but they keep this information hidden from the public.
            """

    logging.info(f"Analyzing paragraph: {test_paragraph}")
    results = analyze_text(test_paragraph)
    logging.info(f"Final results: {results}")

