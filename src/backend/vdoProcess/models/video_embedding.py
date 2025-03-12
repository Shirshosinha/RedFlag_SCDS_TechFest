import torch
from transformers import AutoImageProcessor, TimesformerModel
import numpy as np
from decord import VideoReader
from decord import cpu
from sklearn.metrics.pairwise import cosine_similarity

class VdoEmbeddings:
    def __init__(self, timesformer:str="facebook/timesformer-base-finetuned-k400"):
        self.image_processor = AutoImageProcessor.from_pretrained(timesformer)
        self.model = TimesformerModel.from_pretrained(timesformer)

        self.model.eval()

    def get_embeddings(self, video_path: str, num_frames: int = 16):
        video_reader = VideoReader(video_path, ctx=cpu(0))
        video_length = len(video_reader)

        indices = np.linspace(0, video_length - 1, num=num_frames, dtype=int)
        video_frames = video_reader.get_batch(indices).asnumpy()

        inputs = self.image_processor(list(video_frames), return_tensors="pt")
        with torch.no_grad():
            outputs = self.model(**inputs)
            embeddings = outputs.last_hidden_state[:, 0, :].squeeze(0).cpu().numpy()

        return embeddings


    def get_similarity(self, video_path_1: str, video_path_2: str):
        embeddings_1 = self.get_embeddings(video_path_1).reshape(1, -1)
        embeddings_2 = self.get_embeddings(video_path_2).reshape(1, -1)

        return cosine_similarity(embeddings_1, embeddings_2)[0][0]
    
if __name__ == "__main__":
    vdo_embeddings = VdoEmbeddings()
    similarity = vdo_embeddings.get_similarity("src/backend/vdoProcess/models/test/0017_fake.mp4.mp4", "src/backend/vdoProcess/models/test/test_fake_real.mp4")
    print(similarity)
