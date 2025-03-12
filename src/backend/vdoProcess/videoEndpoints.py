from .GenConViT.prediction import predict, load_genconvit, real_or_fake
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from pydantic import BaseModel
from .GenConViT.model.config import load_config
from .GenConViT.model.pred_func import set_result, is_video
import requests
import shutil
import subprocess
import os
# from moviepy import VideoFileClip
import uuid
import math
from videohash import VideoHash
from .database.snowflake import SnowflakeDB
import pandas as pd

config = load_config()

class VideoURI(BaseModel):
    uri: str

app = FastAPI()
net = "gencovit"
model = load_genconvit(config, net, "genconvit_ed_inference", "genconvit_vae_inference", False)

# def convert_webm_to_mp4(input_path, output_path):
#     clip = VideoFileClip(input_path)
#     clip.write_videofile(output_path, codec="libx264", audio_codec="aac")
#     clip.close()

def convert_to_string_prediction(prediction):
    if prediction == 1:
        return "REAL"
    elif prediction == -1:
        return "FAKE"
    else:
        return "UNDETERMINED"

def compute_final_video_prediction(database: SnowflakeDB, video_url: str):
    """
    Compute the final prediction and confidence for a video
    based on the predictions of its blobs.
    """
    # Fetch all blobs for the given video
    query = f"SELECT DEEPFAKE_PREDICTION, CONFIDENCE FROM BLOBS WHERE VIDEO_URL = '{video_url}';"
    blob_df = database.fetch_dataframe(query)

    if blob_df.empty:
        raise HTTPException(status_code=500, detail="Failed to insert blob row in snowflake")  # Default if no blobs exist

    fake_confidences = []
    real_confidences = []
    
    for _, row in blob_df.iterrows():
        print(row)
        if row["DEEPFAKE_PREDICTION"] == "FAKE":
            fake_confidences.append(row["CONFIDENCE"])
        else:
            real_confidences.append(row["CONFIDENCE"])

    # Final Prediction Logic
    if fake_confidences:  # If any blob is FAKE, set video to FAKE
        final_prediction = -1
        final_confidence = max(fake_confidences)  # Highest confidence among FAKE blobs
    else: # If no FAKE blobs, set video to REAL
        final_prediction = 1
        final_confidence = max(real_confidences)  # Lowest confidence among REAL blobs

    return final_prediction, final_confidence

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
        '-preset', 'slow',   # better quality at the cost of encoding time
        '-crf', '18',        # lower CRF means higher quality (range is 0-51)
        '-c:a', 'aac',
        '-b:a', '192k',      # ensure decent audio quality
        output_path
    ]
    subprocess.run(command, check=True)

def insert_video(video_url, final_prediction, final_confidence, user_feedback, database: SnowflakeDB):
    database.execute(f"""
        INSERT INTO VIDEOS (VIDEO_URL, FINAL_PREDICTION, FINAL_CONDITION, USER_FEEDBACK) VALUES ({video_url}, {final_prediction}, {final_confidence}, {user_feedback});
    """)

def insert_blob(blob_id, blob_url, prediction, confidence, blob_hash, database: SnowflakeDB):
    blob_hash = ", ".join([str(x) for x in blob_hash])
    query = f"""
        INSERT INTO BLOBS (BLOB_ID, VIDEO_URL, DEEPFAKE_PREDICTION, CONFIDENCE, VIDEO_HASH) 
        SELECT '{blob_id}', '{blob_url}', {prediction}, {confidence}, ARRAY_CONSTRUCT({blob_hash});
    """
    print(query)
    database.execute(query)
    

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
async def predict_video_blob(file: UploadFile = File(...), video_url: str = Form(...)):
    try:
        database = SnowflakeDB(
            account="KXCIVVH-LL27432",
            user="raghavg332",
            password="Qa29Kh4MptfGHEW",
            warehouse="COMPUTE_WH",
            database="VIDEOSDB",
            schema="PUBLIC"
        )
        database.connect()
        # if video_url is None:
        #     raise HTTPException(status_code=400, detail="Video URL is required")
        video_bytes = await file.read()
        unique_id = uuid.uuid4()
        input_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),f"tmp/temp_video_{unique_id}.webm")
        output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),f"tmp/converted_video_{unique_id}.mp4")
        with open(input_path, "wb") as f:
            f.write(video_bytes)
        # convert_webm_to_mp4(input_path, output_path)
        convert_video(input_path, output_path)
        video_hash = [float(x) for x in str(VideoHash(output_path).hash[2:])]


        url_search_query = f"SELECT VIDEO_URL, FINAL_PREDICTION, FINAL_CONFIDENCE FROM VIDEOS WHERE VIDEO_URL = '{video_url}' ORDER BY FINAL_PREDICTION ASC LIMIT 1;"
        url_df = database.fetch_dataframe(url_search_query)
        print(url_df)

        if not url_df.empty and url_df["FINAL_PREDICTION"][0].item() == -1:
            return {"result": convert_to_string_prediction(url_df["FINAL_PREDICTION"][0].item()), "accuracy": url_df["FINAL_CONFIDENCE"][0].item()}
        
        similarity_search_query = f"SELECT VIDEO_URL, VECTOR_COSINE_SIMILARITY(VIDEO_HASH::VECTOR(FLOAT, 64), {video_hash}::VECTOR(FLOAT, 64)) AS similarity, DEEPFAKE_PREDICTION, CONFIDENCE FROM BLOBS WHERE VECTOR_COSINE_SIMILARITY(VIDEO_HASH::VECTOR(FLOAT, 64), {video_hash}::VECTOR(FLOAT,64)) > 0.9;"
        similar_df = database.fetch_dataframe(similarity_search_query)

        if not similar_df.empty:
            return {"result": convert_to_string_prediction(similar_df["DEEPFAKE_PREDICTION"][0].item()), "accuracy": similar_df["CONFIDENCE"][0].item()}

        if is_video(output_path):
            result = set_result()
            print("Predicting...")
            result, accuracy, count, pred = predict(output_path, model, False, result, 15, net, "uncategorized", 0)
            print(
                        f"Prediction: {pred[1]} {real_or_fake(pred[0])}"
                    )
            confidence = abs(pred[1] - 0.5) * 2
            blob_prediction = real_or_fake(pred[0]) if pred[1] != 0.5 else 0
            # insert_query = f"INSERT INTO BLOB (BLOB_URL, DEEPFAKE_PREDICTION, CONFIDENCE, VIDEO_HASH) VALUES ({video_url}, {real_or_fake(pred[0]) if pred[1] != 0.5 else "UNDETERMINED"}, {confidence}, {video_hash});"
            insert_blob(str(unique_id), video_url, blob_prediction, confidence, video_hash, database)

            final_prediction, final_confidence = compute_final_video_prediction(database, video_url)

            update_query = f"""
                MERGE INTO VIDEOS AS target
                USING (SELECT '{video_url}' AS video_url) AS source
                ON target.VIDEO_URL = source.video_url
                WHEN MATCHED THEN 
                    UPDATE SET FINAL_PREDICTION = '{final_prediction}', FINAL_CONFIDENCE = {final_confidence}
                WHEN NOT MATCHED THEN
                    INSERT (VIDEO_URL, FINAL_PREDICTION, FINAL_CONFIDENCE, FAKE_USER_FEEDBACK, REAL_USER_FEEDBACK) 
                    VALUES ('{video_url}', '{final_prediction}', {final_confidence}, 0, 0);
            """

            database.execute(update_query)
            

            os.remove(input_path)
            os.remove(output_path)
            return {"result": real_or_fake(pred[0]) if pred[1] != 0.5 else 0, "accuracy": abs(pred[1] - 0.5)}
        else:
            return {"error": "Invalid video file"}
    finally:
        database.close()
    
@app.post("/api/feedback")
async def submit_feedback(video_url: str = Form(...), feedback: str = Form(...)):
    try:
        database = SnowflakeDB(
            account="KXCIVVH-LL27432",
            user="raghavg332",
            password="Qa29Kh4MptfGHEW",
            warehouse="COMPUTE_WH",
            database="VIDEOSDB",
            schema="PUBLIC"
        )
        database.connect()
        
        # Check if feedback value is valid
        if feedback.upper() not in ["REAL", "FAKE"]:
            raise HTTPException(status_code=400, detail="Feedback must be either 'REAL' or 'FAKE'")
        
        # Check if video exists in database
        check_query = f"SELECT VIDEO_URL FROM VIDEOS WHERE VIDEO_URL = '{video_url}';"
        video_exists = database.fetch_dataframe(check_query)
        
        if video_exists.empty:
            # If video doesn't exist, create a new record with initial feedback
            if feedback.upper() == "REAL":
                insert_query = f"""
                    INSERT INTO VIDEOS (VIDEO_URL, FINAL_PREDICTION, FINAL_CONFIDENCE, FAKE_USER_FEEDBACK, REAL_USER_FEEDBACK) 
                    VALUES ('{video_url}', 0, 0, 0, 1);
                """
            else:  # FAKE
                insert_query = f"""
                    INSERT INTO VIDEOS (VIDEO_URL, FINAL_PREDICTION, FINAL_CONFIDENCE, FAKE_USER_FEEDBACK, REAL_USER_FEEDBACK) 
                    VALUES ('{video_url}', 0, 0, 1, 0);
                """
            database.execute(insert_query)
        else:
            # If video exists, update the appropriate feedback counter
            if feedback.upper() == "REAL":
                update_query = f"""
                    UPDATE VIDEOS 
                    SET REAL_USER_FEEDBACK = REAL_USER_FEEDBACK + 1 
                    WHERE VIDEO_URL = '{video_url}';
                """
            else:  # FAKE
                update_query = f"""
                    UPDATE VIDEOS 
                    SET FAKE_USER_FEEDBACK = FAKE_USER_FEEDBACK + 1 
                    WHERE VIDEO_URL = '{video_url}';
                """
            database.execute(update_query)
        
        # Get updated feedback counts
        result_query = f"SELECT FAKE_USER_FEEDBACK, REAL_USER_FEEDBACK FROM VIDEOS WHERE VIDEO_URL = '{video_url}';"
        feedback_counts = database.fetch_dataframe(result_query)
        
        return {
            "success": True,
            "video_url": video_url,
            "real_votes": feedback_counts["REAL_USER_FEEDBACK"][0].item(),
            "fake_votes": feedback_counts["FAKE_USER_FEEDBACK"][0].item()
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing feedback: {str(e)}")
    
    finally:
        database.close()