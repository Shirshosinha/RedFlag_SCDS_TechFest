from fastapi import FastAPI
from pydantic import BaseModel
from text_analysis import analyze_text  # Import the function

app = FastAPI()

# Define request model for input text
class TextRequest(BaseModel):
    text: str

# Define API endpoint for text analysis
@app.post("/analyze/")
async def analyze_text_api(request: TextRequest):
    result = analyze_text(request.text)
    return result

# Run the API when executing this file
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
