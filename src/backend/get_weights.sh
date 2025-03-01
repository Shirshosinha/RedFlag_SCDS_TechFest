#!/bin/bash
if ! command -v wget &> /dev/null; then
    echo "Error: wget is not installed. Please install wget and try again."
    exit 1
fi

URL_vae="https://huggingface.co/Deressa/GenConViT/resolve/main/genconvit_vae_inference.pth"
URL_ed="https://huggingface.co/Deressa/GenConViT/resolve/main/genconvit_ed_inference.pth"

DEST_DIR="$(pwd)/vdoProcess/GenConViT/weight"

FILENAME_vae=$(basename "$URL_vae")
FILENAME_ed=$(basename "$URL_ed")
DEST_FILE_vae="$DEST_DIR/$FILENAME_vae"
DEST_FILE_ed="$DEST_DIR/$FILENAME_ed"

echo "Downloading file from: $URL_vae"
echo "Saving file as: $DEST_FILE_vae"

wget -O "$DEST_FILE_vae" "$URL_vae"

echo "Downloading file from: $URL_ed"
echo "Saving file as: $DEST_FILE_ed"

wget -O "$DEST_FILE_ed" "$URL_ed"

if [ $? -eq 0 ]; then
    echo "Download successful!"
else
    echo "Download failed!"
    exit 1
fi