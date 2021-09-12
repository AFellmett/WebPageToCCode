#!/usr/bin/env node
'use strict';

/**
 * Declare imports
 */
import {existsSync, promises} from 'fs';
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
const templateDir = `template/${framework}/`;
const sourceFileName = framework == 'arduino' ? 'website.cpp' : 'website.c';
const copyright = `Copyright ${new Date().getFullYear()} ${argv.author}\n`;

/**
 * Copy the template Header file and add the copyright statement
 *
 * @param {string} targetDir Target directory, where the C Files are going to be placed
 */
async function createHeader(targetDir) {
  if (targetDir == null) return;

  try {
    await promises.writeFile(`${targetDir}/${headerFileName}`, `/* ${copyright}`);
    const data =
      await promises.readFile(new URL(`${templateDir}${headerFileName}`, import.meta.url));
    await promises.appendFile(`${targetDir}/${headerFileName}`, data);
  } catch (error) {
    console.log(error);
  }
}

/**
 *
 * @param {string} targetDir Target directory, where the C Files are going to be placed
 */
async function createSourceFile(targetDir) {
  if (targetDir == null) return;

  try {
    await promises.writeFile(`${targetDir}/${sourceFileName}`, `/* ${copyright}`);
    const data =
      await promises.readFile(new URL(`${templateDir}${sourceFileName}`, import.meta.url));
    await promises.appendFile(`${targetDir}/${sourceFileName}`, data);
  } catch (error) {
    console.log(error);
  }
}

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

/** writeFileData is used to write a C style char array
 *  containing all bytes of a given file
 *
 * @param {string} targetDir Target directory, where the C Files are going to be placed
 * @param {string} rootDir is representing the root directory
 * which contains the files
 * @param {string} fileName the name of the file to transform into char array
 */
async function writeFileData(targetDir, rootDir, fileName) {
  if (rootDir == null || fileName == null) return;

  const name = formatName(fileName);
  const data = await promises.readFile(`${rootDir}/${fileName}`);
  const length = data.length;

  // adding a seperate const with the length of the array helps
  // to optimize the runtime code later on
  await promises.appendFile(`${targetDir}/${sourceFileName}`
      , `const size_t ${name}_Length = ${length};\n`);
  switch (framework) {
    case 'esp-idf':
      await promises.appendFile(`${targetDir}/${sourceFileName}`
          , `const char ${name}[] = {\n`);
      break;
    default:
      await promises.appendFile(`${targetDir}/${sourceFileName}`
          , `const char ${name}[] PROGMEM = {\n`);
      break;
  }
  // use the buffer to not perform the slice function on each
  // iteration step
  const buffer = data.slice(0, -1);
  for (const byte of buffer) {
    await promises.appendFile(`${targetDir}/${sourceFileName}`, `0x${byte.toString(16)}, `);
  }
  await promises.appendFile(`${targetDir}/${sourceFileName}`
      , `0x${data[length-1].toString(16)}\n};\n\n`);
}

/** writeFunctions is used to create the functions
 *  used by server to serve the websites
 *
 * @param {string} targetDir Target directory, where the C Files are going to be placed
 * @param {string} fileName the name of the file which has to be served
 * @param {string} mimetype the mime type of the file
 */
async function writeFunctions(targetDir, fileName, mimetype) {
  if (fileName == null || mimetype == null) return;

  const name = formatName(fileName);
  switch (framework) {
    case 'esp-idf':
      // just build the structure with all informations
      await promises.appendFile(`${targetDir}/${sourceFileName}`
          , `struct web_content st_${name} = {\n`);
      await promises.appendFile(`${targetDir}/${sourceFileName}`
          , `  .length = ${name}_Length,\n`);
      await promises.appendFile(`${targetDir}/${sourceFileName}`
          , `  .data = ${name},\n`);
      await promises.appendFile(`${targetDir}/${sourceFileName}`
          , `  .compression = ${fileName.endsWith('.gz')},\n`);
      await promises.appendFile(`${targetDir}/${sourceFileName}`
          , `  .content_type = "${mimetype}"\n};\n\n`);
      break;
    default:
      await promises.appendFile(`${targetDir}/${sourceFileName}`, `void ${name}Page() {\n`);
      if (fileName.endsWith('.gz')) {
        await promises.appendFile(`${targetDir}/${sourceFileName}`
            , '  server.sendHeader("Content-Encoding", "gzip");\n');
      }
      // the server.send_P() function does exactly what we want
      // and also cares about the content-length header
      await promises.appendFile(`${targetDir}/${sourceFileName}`
          , `  server.send_P(200, "${mimetype}", ${name}, ${name}_Length);\n}\n\n`);
      break;
  }
}

/** writeRegisterFunction is used to setup the registerWebsite()
 *  function and link all entrypoints of the website
 *
 * @param {string} targetDir Target directory, where the C Files are going to be placed
 * @param {string[]} fileNames all files which have to be referenced
 */
async function writeRegisterFunction(targetDir, fileNames) {
  if (fileNames == null) return;

  switch (framework) {
    case 'esp-idf':
      let register = 'void registerWebsite(httpd_handle_t server) {\n';
      for (const file of fileNames) {
        const name = formatName(file);
        const fileNameWoCompression = file.split('.gz')[0];

        if (fileNameWoCompression == 'index.html') {
          register =
            register.concat(`  httpd_register_uri_handler(server, &index_html_Page);\n`);
          await promises.appendFile(`${targetDir}/${sourceFileName}`
              , `httpd_uri_t index_html_Page = {\n`);
          await promises.appendFile(`${targetDir}/${sourceFileName}`
              , `  .uri       = "/",\n`);
          await promises.appendFile(`${targetDir}/${sourceFileName}`
              , '  .method    = HTTP_GET,\n');
          await promises.appendFile(`${targetDir}/${sourceFileName}`
              , '  .handler   = website_content_handler,\n');
          await promises.appendFile(`${targetDir}/${sourceFileName}`
              , `  .user_ctx  = &st_${name}\n};\n\n`);
        }
        register = register.concat(`  httpd_register_uri_handler(server, &${name}Page);\n`);

        await promises.appendFile(`${targetDir}/${sourceFileName}`
            , `httpd_uri_t ${name}Page = {\n`);
        await promises.appendFile(`${targetDir}/${sourceFileName}`
            , `  .uri       = "/${fileNameWoCompression}",\n`);
        await promises.appendFile(`${targetDir}/${sourceFileName}`
            , '  .method    = HTTP_GET,\n');
        await promises.appendFile(`${targetDir}/${sourceFileName}`
            , '  .handler   = website_content_handler,\n');
        await promises.appendFile(`${targetDir}/${sourceFileName}`
            , `  .user_ctx  = &st_${name}\n};\n\n`);
      }
      register = register.concat(`}\n\n`);
      await promises.appendFile(`${targetDir}/${sourceFileName}`, register);
      break;
    default:
      await promises.appendFile(`${targetDir}/${sourceFileName}`
          , 'void registerWebsite() {\n');
      for (const file of fileNames) {
        const name = formatName(file);
        const fileNameWoCompression = file.split('.gz')[0];
        if (fileNameWoCompression == 'index.html') {
          await promises.appendFile(`${targetDir}/${sourceFileName}`
              , `  server.on("/", ${name}Page);\n`);
        }
        await promises.appendFile(`${targetDir}/${sourceFileName}`
            , `  server.on("/${fileNameWoCompression}", ${name}Page);\n}\n`);
      }
      break;
  }
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
    // Copy the Header file
    await createHeader(targetDir);

    // Get a list of all files which are inside the sourceDirectory
    const files = await getFiles(sourceDir);

    // Create and open a c source file
    await createSourceFile(targetDir);

    // Write the static information
    // like warning of autogenerated content and include the header file

    // Create a char array constant out of all files
    for (const file of files) {
      await writeFileData(targetDir, sourceDir, file.file);
    }
    // Create a function for each file to serve the matching char array
    for (const file of files) {
      await writeFunctions(targetDir, file.file, file.mime);
    }
    // Finally implement the registerWebsite()
    // function which registers all files with corresponding functions
    await writeRegisterFunction(targetDir, files.map((value) => value.file));

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
