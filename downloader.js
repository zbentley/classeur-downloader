#!/usr/bin/env node
'use strict';

var _ = require('lodash');
var ArgumentParser  = require('argparse').ArgumentParser;
var async = require('async');
var Connection = require("classeur-api-client");
var colors = require('colors');
var fs = require('fs');
var sprintf = require('sprintf').sprintf;
var TreeManipulator = require('tree-manipulator');

var treeManipulator = _.memoize(function(byId) {
    return new TreeManipulator({
        identifierProperty: byId ? "id" : "name",
        nestedNodesProperty: "files",
        valueGetter: function(obj, property) {
            // If we're getting the value of a node, and not its children:
            if (property === this.identifierProperty) { 
                return APIobjectToString(obj, byId);
            } else {
                return obj[property];
            }
        },
    });
});

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

function displayFolderTrees(folders, byId) {
    treeManipulator(byId).print({
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

function APIobjectToString(object, byID) {
    if ( object.id || object.name ) {
        return sprintf(
            "%s (%s)",
            byID ? object.id : object.name,
            byID ? object.name : object.id
        );
    } else {
        return "";
    }
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
            dest: 'byId'
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

    // TODO why is flattening necessary?
    files = _.chain(files).uniq().compact().flatten().value()
    folders = _.chain(folders).uniq().compact().flatten().value()

    if ( folders.length && files.length ) {
        usage("Specifying both files and folders is not allowed");
    } else if ( ! ( folders.length + files.length ) ) {
        usage("At least one file or folder must be specified");
    }

    return {
        apiKey: args.apiKey,
        byId: args.byId,
        files: files,
        folders: folders,
        save: args.path ? validatePath(args.path, usage) : null,
        userId: args.userId,
    };
}

var options = parseArgs();
var conn = new Connection({
    host: "app.classeur.io",
    userId: options.userId,
    apiKey: options.apiKey
});

if (options.folders.length) {
    var cb = options.save ? function () {} : fatal(_.partialRight(displayFolderTrees, options.byId));
    conn.getFolders(options.folders, cb);
} else { // files mode
    conn.getFiles(options.files, fatal(p));
}