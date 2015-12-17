#!/usr/bin/env node
'use strict';

var _ = require('lodash');
var ArgumentParser  = require('argparse').ArgumentParser;
var async = require('async');
var classeur = require("classeur-api-client");
var colors = require('colors');
var fs = require('fs');
var sprintf = require('sprintf').sprintf;
var TreeManipulator = require('tree-manipulator');

function p(args) {
    console.log(args);
}

function fatal(cb) {
    return function(error, result) {
        if (error) {
            throw error;
        } else {
            cb(result);
        }
    }
}

function getFolderTrees(userId, apiKey, folders, cb) {
    var api = classeur.connect({
        host: "app.classeur.io",
        userId: userId,
        apiKey: apiKey, 
    });

    async.map(
        folders,
        _.bind(api.getFolder, api),
        fatal(cb)
    );
}

function displayFolderTrees(folders, byID) {
    var tm = new TreeManipulator({
        identifierProperty: byID ? "id" : "name",
        nestedNodesProperty: "files",
        valueGetter: function(obj, property) {
            // If we're getting the value of a node, and not its children:
            if (property === this.identifierProperty) { 
                return classeur.APIobjectToString(obj, byID);
            } else {
                return obj[property];
            }
        },
    });

    tm.print({
        id: null,
        name: null,
        files: folders // top-level folders
    });
}

function validatePath(path, raise) {
    var stat = _.attempt(fs.statSync, path);
    if ( ! (stat instanceof fs.Stats) ) {
        raise(sprintf("Could not stat directory %s:\n%s", path, stat));
    } else if ( ! stat.isDirectory() ) {
        raise(path + " does not exist or is not a directory");
    }

    var error = _.attempt(fs.accessSync, path, fs.R_OK | fs.W_OK);
    if ( error ) {
        raise(sprintf("Could not get write access to directory %s:\n%s", path, error));
    }
    return path;
}

function parseArgs() {
    var multiItemParser = new ArgumentParser({
        addHelp: false
    });
    multiItemParser.addArgument(
        ['-d', '--folders'],
        {
            action: 'append',
            dest: 'folders',
            nargs: '+',
            metavar: "folderid"
        }
    );

    multiItemParser.addArgument(
        ['-f', '--files'],
        {
            action: 'append',
            dest: 'files',
            nargs: '+',
            metavar: 'fileid'
        }
    );

    multiItemParser.addArgument(
        ['--by-id'],
        {
            action: 'storeTrue',
            dest: 'byID'
        }
    );


    var parser = new ArgumentParser({
        version: '0.0.1',
        addHelp:true,
        description: 'Argparse example'
    });
    var usage = _.modArgs(_.bind(parser.error, parser), colors.red);

    parser.addArgument(
        [ '-u', '--user-id' ],
        {
            help: 'User ID token',
            dest: "userId",
            required: true
        }
    );

    parser.addArgument(
        [ '-k', '--api-key' ],
        {
            help: 'API Key/Password Analogue',
            dest: "apiKey",
            required: true
        }
    );

    var subparsers = parser.addSubparsers({
      title: 'subcommands',
      dest: "subcommand"
    });

    var listParser = subparsers.addParser('list', {
        addHelp: true, 
        parents: [multiItemParser],
    });

    var saveParser = subparsers.addParser('save', {
        addHelp: true, 
        parents: [multiItemParser],
    });

    saveParser.addArgument(
        [ '-m', '--markdown' ],
        {
            help: 'Save markdown contents instead of full JSON metadata (like file and folder IDs)',
            dest: "markdown",
        }
    );

    saveParser.addArgument(
        [ '-p', '--save-path', '--destination' ],
        {
            help: 'Save file and folder contents to a filesystem path',
            dest: "path",
            required: true,
        }
    );

    var args = parser.parseArgs(),
        folders = args.folders || [],
        files = args.files || [];

    if ( folders.length && files.length ) {
        usage("Specifying both files and folders is not allowed");
    } else if ( ! folders.length + files.length ) {
        usage("At least one file or folder must be specified");
    }

    return {
        apiKey: args.apiKey,
        byID: args.byID,
        files: _.chain(files).uniq().compact().value(),
        folders: _.chain(folders).uniq().compact().value(),
        save: args.path ? validatePath(args.path, usage) : null,
        userId: args.userId,
    };
}

var options = parseArgs();
if (options.folders.length) {
    var cb = options.save ? function () {} : _.partialRight(displayFolderTrees, options.byID);
    getFolderTrees(options.userId, options.apiKey, options.folders, cb);
} else { // files mode

}