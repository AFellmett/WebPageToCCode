#!/usr/bin/env node
'use strict';

/**
 * Declare imports
 */
import {existsSync, promises} from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mime from 'mime';
import yargs from 'yargs';
import * as eta from 'eta';

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
    .option('framework', {
      alias: 'f',
      description: 'Specify the target framework.',
      type: 'string',
      choices: ['arduino', 'esp-idf'],
      default: 'arduino',
    })
    .option('author', {
      alias: 'a',
      description: 'Adds the author to the source code files as requierd by cpplint.',
      type: 'string',
      default: 'unknown',
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
const framework = argv.framework;
const templateDir = path.join(path.dirname(fileURLToPath(import.meta.url)),'template',framework);
const sourceFileName = framework == 'arduino' ? 'website.cpp' : 'website.c';
const author = argv.author;
const sourceDir = argv.source;
const year = new Date().getFullYear();

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

/** formatName is used to remove special caracters out of the file name
 * and replace them with `_`
 * @param {string} fileName the name of the file to format
 * @return {string} the formated name
 */
function formatName(fileName) {
  return fileName.toUpperCase().replace(/[^a-zA-Z0-9]/g, '_');
}

async function getContent(fileName) {
  return promises.readFile(`${sourceDir}/${fileName}`);
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
 * @param {string} targetDir Target directory, where the C Files are going to be placed
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
    // configure eta engine
    eta.configure({
      views: templateDir,
      async: true,
    })

    // generate header file
    const website_h = await eta.renderFileAsync(`./${headerFileName}.eta`, {author, year})
    await promises.writeFile(`${targetDir}/${headerFileName}`, website_h);

    // Get a list of all files which are inside the sourceDirectory
    const files = await getFiles(sourceDir);

    // generate source file
    const website = await eta.renderFileAsync(`./${sourceFileName}.eta`, {author, files, formatName, getContent, year})
    await promises.writeFile(`${targetDir}/${sourceFileName}`, website);

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