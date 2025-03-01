from .GenConViT.prediction import predict, load_genconvit, real_or_fake
from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from .GenConViT.model.config import load_config
from .GenConViT.model.pred_func import set_result, is_video
import requests
import shutil
import subprocess
import os
from moviepy import VideoFileClip

config = load_config()

class VideoURI(BaseModel):
    uri: str

app = FastAPI()
net = "gencovit"
model = load_genconvit(config, net, "genconvit_ed_inference", "genconvit_vae_inference", False)

def convert_webm_to_mp4(input_path, output_path):
    clip = VideoFileClip(input_path)
    clip.write_videofile(output_path, codec="libx264", audio_codec="aac")
    clip.close()

def download_video(url, save_path):
    response = requests.get(url, stream=True)
    with open(save_path, "wb") as file:
        shutil.copyfileobj(response.raw, file)
    del response

def convert_video(input_path, output_path):
    command = [
        'ffmpeg',
        '-i', input_path,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-strict', 'experimental',
        output_path
    ]
    subprocess.run(command, check=True)

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.post("/api/predict")
def predict_video(video: VideoURI):
    video_uri = video.uri
    temp_video_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),"tmp/temp_video")
    converted_video_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),"tmp/converted_video.mp4")

    download_video(video_uri, temp_video_path)
    # convert_video(temp_video_path, converted_video_path)
    if is_video(temp_video_path):
        result = set_result()
        print("Predicting...")
        result, accuracy, count, pred = predict(temp_video_path, model, False, result, 15, net, "uncategorized", 0)
        print(
                    f"Prediction: {pred[1]} {real_or_fake(pred[0])}"
                )
        
        os.remove(temp_video_path)
        os.remove(converted_video_path)
        return {"result": real_or_fake(pred[0]), "accuracy": accuracy}

@app.post("/api/video_predict")
async def predict_video_blob(file: UploadFile = File(...)):
    video_bytes = await file.read()
    input_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),"tmp/temp_video.webm")
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),"tmp/converted_video.mp4")
    with open(input_path, "wb") as f:
        f.write(video_bytes)
    # convert_webm_to_mp4(input_path, output_path)
    convert_video(input_path, output_path)
    if is_video(output_path):
        result = set_result()
        print("Predicting...")
        result, accuracy, count, pred = predict(output_path, model, False, result, 15, net, "uncategorized", 0)
        print(
                    f"Prediction: {pred[1]} {real_or_fake(pred[0])}"
                )
        os.remove(input_path)
        os.remove(output_path)
        return {"result": real_or_fake(pred[0]), "accuracy": accuracy}
    else:
        return {"error": "Invalid video file"}
    
