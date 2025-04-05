#!/bin/bash

# Exit on errors
set -e

echo "Packaging CloseAssist extension..."

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Create a zip file of the extension
VERSION=$(grep '"version"' manifest.json | cut -d'"' -f4)
ZIP_NAME="chrome-tab-audio-recorder-v$VERSION.zip"

echo "Creating $ZIP_NAME..."

# Remove any existing zip file
rm -f "$ZIP_NAME"

# Create a new zip file with all the necessary files
zip -r "$ZIP_NAME" \
  manifest.json \
  background.js \
  content-script.js \
  deepgram.js \
  offscreen.html \
  offscreen.js \
  popup.html \
  popup.js \
  sidepanel.html \
  sidepanel.js \
  permission-popup.html \
  permission-popup.js \
  permission-frame.html \
  icons/ \
  img/ \
  README.md

echo "Package created successfully: $ZIP_NAME"
echo "File size: $(du -h "$ZIP_NAME" | cut -f1)" 