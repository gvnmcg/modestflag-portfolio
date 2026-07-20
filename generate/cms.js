/**
 * CMS.js
 * This is a simple CMS for my basic website. 
 * I write Markdown (.md) notes/articles in obsidian.md and then add them to this project. 
 * This script generates a content.json, which organized and tags the md article to be listed and searched on the website.
 * When updating the content.json, it will read in the whole current json file and just add what is missing. 
 * The content.json will include tags and meta data that will not be affected by this script. 
 * This script is just to maintain the file paths, and is used to maintain the link browser. 
 */

const fs = require('fs')


function readContentJSON() {
  if (!fs.existsSync('./content.json')){
    throw Error("file not there")
  }
  const contentJson = JSON.parse('./content.json')


}

function readMdDir() {
  const mdDir = fs.readdirSync('./md')
  mdDir.forEach(f => fs.st)
  console.log(mdDir)
  // 

}

function generateContentJSON(){

  readContentJSON()
  readMdDir()
}

readMD()