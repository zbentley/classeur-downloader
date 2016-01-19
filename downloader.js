#!/usr/bin/env node
'use strict';

const parseArgs = require('./lib/argument-parser'),
    downloader = require('./classeur-downloader');

const options = parseArgs(),
    fatal = (error) => {
        if (error) throw error;
        if (options.verbose) console.log("Successfully completed!");
    };

if ( options.single ) {
	downloader.saveSingleFile(options, fatal);
} else if ( options.path ) {
	downloader.saveTree(options, fatal);
} else {
	downloader.showTree(options, fatal);
}
