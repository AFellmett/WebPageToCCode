 *
 * This file is automatically generated by WebPageToCCode
 * Do not modify ths file, changes will not persist!
 */

#pragma once

/*
 * Include the WebServer library
 */
#include <WebServer.h>

/*
 * The webserver object which is used
 * it has to be created before calling
 * registerWebsite()
 */
extern WebServer server;

/*
 * Registers all files corresponding 
 * to their path and serves the content.
 *
 * Note:
 * index.html will also be registered as root element
 */
void registerWebsite();
