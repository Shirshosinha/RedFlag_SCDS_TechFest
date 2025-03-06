from fastapi import FastAPI
from pydantic import BaseModel
from text_analysis import analyze_text  # Import the function
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Configure CORS - allow all origins for testing; restrict in production as needed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # You can specify a list of origins here
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    uvicorn.run(app, host="127.0.0.1", port=8001)
