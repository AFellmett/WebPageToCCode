# WebPageToCCode

## TLDR;
A tool for generating C-Code out of a website to be used to compile it into ESP8266 or ESP32 based projects.

## What does it do?

This tool can take an output folder of a modern webframework like Angular or React and recursivly map all files into a C header and source file.
Afterwords it uses the popular Arduino Webserver library to register all files by it's file positions and create a callback functions for it.

## Why the project is useful?

The main goal is to split and automate the process of creating a modern website using popular frameworks and easily map it into an ESP Firmware without worry about all the fancy web stuff like Media Types, Compression Minfying...

## How to use the tool?

### Install

```bash
npm install -D webpagetoccode
```

### Usage 
To use it via command line simply put 

```bash
webpagetoccode <sourcefolder> <targetfolder> 
```

It can also be used within the package.json as postbuild command.

For example within an React Project:

```json
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject",
    "postbuild": "precompress -t gz -i html,js,json,css,txt build && webpagetoccode build ../target"
  }
```

---
**NOTE**

The tool checks for files which are compressed as `gz`. You can leave the compressed and none-compressed files side by side and the tool takes only the compressed files wherever possible.

---

## How does it looks like?

The Tool generates to files `website.h` and `websites.cpp`. 
The first one `website.h` just declare the Webserver as `extern` dependency and publishes the `registerWebsite()` function.
The second file `website.cpp` contains all the stuff.

To include the website just copy both generated files into your Arduino / CPP project and `#include "website.h"`.
After you setup your Webserver call `registerWebsite()` - That's it.

```cpp
#include <Webserver.h>
#include "website.h"

WebServer server(80);

void setup(){
  registerWebsite();
  server.begin();
}

void loop(){
  server.handleClient();
}
```

---
**NOTE**

If the tool finds an `index.html` file in your root folder, it automatically addes a default route `"/"` to serve this file. 

Regardless if it`s a compressed file or not.

---
