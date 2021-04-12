#!/usr/bin/env node
'use strict';

/**
 * Declare imports
 */
import {existsSync, promises, createWriteStream} from 'fs';
import mime from 'mime';
import yargs from 'yargs';

/**
 * Configure CLI Options
 */
const argv = yargs(process.argv.splice(2))
    .option('source', {
      alias: 's',
      description: 'Sets the root directory containing the website.',
      type: 'string',
    })
    .option('target', {
      alias: 't',
      description: 'Sets the target directory where the output is generated.',
      type: 'string',
      default: 'lib',
    })
    .demandOption(['source'], 'Please specify at least a source directory.')
    .check((argv) => {
      // Check if the source folder exists.
      // That's the minimal requirement to run this tool.
      if (existsSync(argv.source)) {
        return true;
      }
      throw new Error(`Directory '${argv.source}' does not exists.`);
    })
    .strict()
    .showHelpOnFail(true)
    .help()
    .alias('help', 'h')
    .argv;

/*
 * Constants used
 */
const headerFileName = 'website.h';
const templateHeader = `template/${headerFileName}`;
const sourceFileName = 'website.cpp';
const warningAutogenerated = '' +
  '/* This file is automatically generated by WebPageToCCode\n' +
  '* Do not modify ths file, changes will not persist!\n' +
  '*/\n\n';

const includeHeader = `#include "${headerFileName}"\n\n`;

/** getFiles is used to get all webfiles of a directory recursivly.
 *
 * It takes care if compressed files (currently only `.gz`)
 * are located next to non compressed files.
 * It uses the uncompressed mimetype and select the compressed file.
 *
 * @param {string} source Sourcedirectory containg the website
 * @return {[{file: string, mime: string}]} an array of objects containing
 *            the filename and mimetype as string
 */
async function getFiles(source) {
  if (source == null) return;
  const files = [];
  // get all files inside the source directory,
  // but filter those which are also in compressed foramt inside the same directory
  const allFilesOfDirectory = (await promises.readdir(source)).filter(
      (item, pos, arr) => item.endsWith('.gz') || !arr.includes(`${item}.gz`));
  for (const file of allFilesOfDirectory) {
    // Check if an entry is a directory
    const stats = await promises.stat(`${source}/${file}`);
    if (stats.isDirectory()) {
      // If it's a directory get all files out of the directory
      // but prefix the files with the directoryname
      const subDir = await getFiles(`${source}/${file}`);
      subDir.forEach((value) => value.file = `${file}/${value.file}`);
      files.push(...subDir);
    } else {
      // If it's just a file get the mime type and add it to the file list
      if (file.endsWith('.gz')) {
        files.push({file: file, mime: mime.getType(file.split('.gz')[0])});
      } else {
        files.push({file: file, mime: mime.getType(file)});
      }
    }
  }
  return files;
}

/** writeHeader is used to write generic informations
 * on top of the C source file
 *
 * @param {fs.WriteStream} fileHandle fileHandle to write the content
 */
function writeHeader(fileHandle) {
  if (fileHandle == null) return;

  fileHandle.write(warningAutogenerated);
  fileHandle.write(includeHeader);
}

/** formatName is used to remove special caracters out of the file name
 * and replace them with `_`
 * @param {string} fileName the name of the file to format
 * @return {string} the formated name
 */
function formatName(fileName) {
  return fileName.toUpperCase().replace(/[^a-zA-Z0-9]/g, '_');
}

/** writeFileData is used to write a C style char array
 *  containing all bytes of a given file
 *
 * @param {fs.WriteStream} fileHandle fileHandle to write the content
 * @param {string} rootDir is representing the root directory
 * which contains the files
 * @param {string} fileName the name of the file to transform into char array
 */
async function writeFileData(fileHandle, rootDir, fileName) {
  if (fileHandle == null || rootDir == null || fileName == null) return;

  const name = formatName(fileName);
  const data = await promises.readFile(`${rootDir}/${fileName}`);
  const length = data.length;

  // adding a seperate const with the length of the array helps
  // to optimize the runtime code later on
  fileHandle.write(`const size_t ${name}_Length = ${length};`);
  fileHandle.write(`const char ${name} [] PROGMEM = {\n`);
  // use the buffer to not perform the slice function on each
  // iteration step
  const buffer = data.slice(0, -1);
  for (const byte of buffer) {
    fileHandle.write(`0x${byte.toString(16)}, `);
  }
  fileHandle.write(`0x${data[length-1].toString(16)}\n};\n\n`);
}

/** writeFunctions is used to create the functions
 *  used by server to serve the websites
 *
 * @param {fs.WriteStream} fileHandle fileHandle to write the content
 * @param {string} fileName the name of the file which has to be served
 * @param {string} mimetype the mime type of the file
 */
function writeFunctions(fileHandle, fileName, mimetype) {
  if (fileHandle == null || fileName == null || mimetype == null) return;

  const name = formatName(fileName);
  fileHandle.write(`void ${name}Page() { \n`);
  if (fileName.endsWith('.gz')) {
    fileHandle.write('\tserver.sendHeader("Content-Encoding", "gzip");\n');
  }
  // the server.send_P() function does exactly what we want
  // and also cares about the content-length header
  fileHandle.write(`\tserver.send_P(200, "${mimetype}", ${name}, ${name}_Length);\n}\n\n`);
}

/** writeRegisterFunction is used to setup the registerWebsite()
 *  function and link all entrypoints of the website
 *
 * @param {fs.WriteStream} fileHandle fileHandle to write the content
 * @param {string[]} fileNames all files which have to be referenced
 */
function writeRegisterFunction(fileHandle, fileNames) {
  if (fileHandle == null || fileNames == null) return;

  fileHandle.write('void registerWebsite(){\n');
  for (const file of fileNames) {
    const name = formatName(file);
    const fileNameWoCompression = file.split('.gz')[0];
    if (fileNameWoCompression == 'index.html') {
      fileHandle.write(`\tserver.on("/",${name}Page);\n`);
    }
    fileHandle.write(`\tserver.on("/${fileNameWoCompression}",${name}Page);\n`);
  }
  fileHandle.write('}\n');
}

/** Entry point
 *
 * Note: This scirpt is ment to run after the website is completed and
 *       ready to be ported to the mcu. Therefore performance or
 *       time consumption is not an issue.
 *       The way the C code is generated can be optimized;
 *       But I prefer to have a more readable approach instead.
 *       Also the C code itself can be more dense;
 *       But there is no need for, the compiler itself can easily
 *       optimize it and it remains readable.
 *
 * @param {string} sourceDir Source directory, where the Webfiles are located
 * @param {string} targetDir Target directory,
 * where the C Files are going to be placed
 * @return {number} return code: 0 - everything went well;
 *  everything else is the js specific errorCode
 */
async function main(sourceDir, targetDir) {
  if (sourceDir == null || !existsSync(sourceDir)) return;

  let returnCode = 0;
  // Check if the directory exists or if it can be created
  try {
    if (!existsSync(targetDir)) {
      await promises.mkdir(targetDir);
    }
  } catch (error) {
    console.error(`'${targetDir}' seems to be unusable.`, error);
    return -1;
  }
  // sourceDirectory and targetDirectory exists -> do the work
  try {
    // Copy the Header file to the output directory
    // The header file does not contain any content specific information
    // therefore we can just copy the template
    await promises.copyFile(new URL(templateHeader, import.meta.url),
        `${targetDir}/${headerFileName}`);

    // Get a list of all files which are inside the sourceDirectory
    const files = await getFiles(sourceDir);

    // Create and open a c source file
    const sourceFile =
      createWriteStream(`${targetDir}/${sourceFileName}`);
    // Write the static information
    // like warning of autogenerated content and include the header file
    writeHeader(sourceFile);

    // Create a char array constant out of all files
    for (const file of files) {
      await writeFileData(sourceFile, sourceDir, file.file);
    }
    // Create a function for each file to serve the matching char array
    for (const file of files) {
      writeFunctions(sourceFile, file.file, file.mime);
    }
    // Finally implement the registerWebsite()
    // function which registers all files with corresponding functions
    writeRegisterFunction(sourceFile, files.map((value) => value.file));

    // Close the file in every case and return the result
    sourceFile.close();
    return returnCode;
  } catch (error) {
    // Give additional information
    console.error('Something went wrong!', error);
    returnCode = error.errno;
  }
}

/**
 * Execute main with given parameters
 */
main(argv.source, argv.target);
