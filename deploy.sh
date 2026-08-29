#!/bin/bash
# Run this on the cPanel server from the repo checkout (e.g. ~/repositories/modestflag-portfolio)
# to copy the site's static files into public_html, overwriting anything already there.
set -e

DEST="../../public_html"

cp -r content "$DEST/"
cp -r app "$DEST/"
cp content-manifest.json "$DEST"
cp index.html "$DEST"
cp index.css "$DEST"

echo "Deployed to $DEST"