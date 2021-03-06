/* Copyright 2021 Alexander Fellmett
 *
 * This file is automatically generated by WebPageToCCode
 * Do not modify ths file, changes will not persist!
 */

#ifndef __WEBSITE_H_
#define __WEBSITE_H_
/*
 * Include the WebServer library
 */
#include <esp_http_server.h>

/*
 * Define the chunksize which is used to split
 * the content.
 * Depends on buffer size of httpd
 */
#ifndef CHUNKSIZE
#define CHUNKSIZE 256
#endif

/*
 * Registers all files corresponding 
 * to their path and serves the content.
 *
 * Note:
 * index.html will also be registered as root element
 */
void registerWebsite(httpd_handle_t server);
#endif /* __WEBSITE_H_ */