from fastapi import FastAPI
from vdoProcess.videoEndpoints import app as video_app

app = FastAPI()

app.mount("/video", video_app)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)