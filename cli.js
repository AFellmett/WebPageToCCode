#!/usr/bin/env node

const fs = require("fs");
const mime = require('mime');

const[,, ... [source, target]] = process.argv

const headerFileName = `website.h`;
const template_header = `template/${headerFileName}`;
const sourceFileName = `website.cpp`;
const linebreak = `\r\n`;

const warning_autogenerated = `/* This file is automatically generated by WebPageToCCode ${linebreak} * Do not modify ths file, changes will not persist!${linebreak} */${linebreak}${linebreak}`;
const include_header = `#include "${headerFileName}"${linebreak}${linebreak}`;

async function getFiles(source) {
  if(source === null) return;
  let files = [];
  const allFilesOfDirectory = await fs.promises.readdir(source)
  for(const file of allFilesOfDirectory)
  {
    const stats = await fs.promises.stat(`${source}/${file}`);
    if(stats.isDirectory())
    {
      const subFolder = await getFiles(`${source}/${file}`);
      files.push(... subFolder.map(value => `${file}/${value}`));
    }
    else
      files.push(file);
  }
  return files;
}

async function writeHeader(fileHandle){
  await fileHandle.write(warning_autogenerated);
  await fileHandle.write(include_header);
}

function adjustName(fileName){
  return fileName.toUpperCase().split('.').join('_').split('-').join('_').split('/').join('_');
}

async function writeData(fileHandle, root, file){
  if(fileHandle === null || root === null || file === null) return;

  const name = adjustName(file);
  const data = await fs.promises.readFile(`${root}/${file}`);
  const length = data.length;

  await fileHandle.write(`const size_t ${name}_Length = ${length};${linebreak}`);
  await fileHandle.write(`const char ${name} [] PROGMEM = {${linebreak}`);
  
  const buffer = data.slice(0,-1);
  for(const byte of buffer)
    await fileHandle.write(`0x${byte.toString(16)}, `)
  await fileHandle.write(`0x${data[length-1].toString(16)}${linebreak}};${linebreak}${linebreak}`)

  return [name, file]
}

async function writeFunctions(fileHandle, file, mimetype){
  if(fileHandle === null || file === null || mimetype === null) return;

  const name = adjustName(file);
  await fileHandle.write(`void ${name}Page(){ ${linebreak}`);
  if(file.endsWith(`.gz`))
    await fileHandle.write(`\tserver.sendHeader(F("Content-Encoding"), F("gzip"));${linebreak}`);
  await fileHandle.write(`\tserver.setContentLength(${name}_Length);${linebreak}`);
  await fileHandle.write(`\tserver.send(200, "${mimetype}");${linebreak}`);
  await fileHandle.write(`\tserver.sendContent(${name},${name}_Length);${linebreak}};${linebreak}${linebreak}`);
}

async function writeRegisterFunction(fileHandle, files){
  if(fileHandle === null || files === null) return;

  await fileHandle.write(`void registerWebsite(){${linebreak}`);
  for(const file of files){
    const name = adjustName(file);
    const filename_without_compression = file.split(`.gz`)[0];
    if(filename_without_compression === 'index.html')
      await fileHandle.write(`\tserver.on("/",${name}Page);${linebreak}`)
    await fileHandle.write(`\tserver.on("/${filename_without_compression}",${name}Page);${linebreak}`)
  }
  await fileHandle.write("}");
}

async function main(source, target = `lib`) {
  if(source === null) return;

  try{
    if(!fs.existsSync(target))
    await fs.promises.mkdir(target);
  }
  catch(error)
  {
    console.error(`Directory '${target}' does not exists and cannot be created.`, error);
    return -1;
  }
  try{
    await fs.promises.copyFile(template_header,`${target}/${headerFileName}`);
    
    files = await getFiles(source); 
    const sourceFile = fs.createWriteStream(`${target}/${sourceFileName}`);
    await writeHeader(sourceFile);
    files = files.map(file => {
      if(!file.endsWith(`.gz`)){
        if(files.includes(`${file}.gz`))
          return [`${file}.gz`, mime.getType(file)];        
        return [file, mime.getType(file)]  
      }
      return null;
    });
    files = files.filter(file => file !== null);
    for(const file of files){
      await writeData(sourceFile, source, file[0]);
    }
    for(const file of files){
      await writeFunctions(sourceFile,file[0], file[1]);
    }
    await writeRegisterFunction(sourceFile,files.map(value => value[0]));
  
    sourceFile.close();
    return 0;
  }
  catch(error)
  {
    console.error(`Something went wrong!`, error);
    return -1;
  }

}

// TODO: comment everything

main(source, target);