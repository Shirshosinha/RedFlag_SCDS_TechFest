from fastapi import FastAPI
from pydantic import BaseModel
from text_analysis import analyze_text  # Import the function


import logging

# Enable detailed logging for debugging
logging.basicConfig(
    level=logging.DEBUG,  # Set to DEBUG for detailed logs
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI()

# Define request model for input text
class TextRequest(BaseModel):
    text: str
    url: str

# Define API endpoint for text analysis
@app.post("/analyze/")
async def analyze_text_api(request: TextRequest):
    result = analyze_text(request.text,request.url)
    return result

# Run the API when executing this file
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
