#!/usr/bin/env node

var _ = require('lodash');
var async = require('async');
var classeur = require("classeur-api-client");
var cli = require('commander');
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
        // If we're getting the value of a node, and not its children:
        valueGetter: function(obj, property) {
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

function usage(msg) {
    p(msg.red);
    cli.help();
}


function pushToArray(array, split) {
    if ( split ) {
        return function(val) {
            _.spread(_.bind(Array.prototype.push, array))(val.split(","));
        };
    } else {
        return _.ary(_.bind(Array.prototype.push, array), 1);
    }
}

function validatePath(path) {
    if ( path ) {
        var stat = _.attempt(fs.statSync, path);
        if ( ! (stat instanceof fs.Stats) ) {
            usage(sprintf("Could not stat directory %s:\n%s", path, stat));
        } else if ( ! stat.isDirectory() ) {
            usage(path + " does not exist or is not a directory");
        }

        var error = _.attempt(fs.accessSync, path, fs.R_OK | fs.W_OK);
        if ( error ) {
            usage(sprintf("Could not get write access to directory %s:\n%s", path, error));
        }
    }
    return path;
}

function parseArgs() {
    var folders = [], files = [];

    cli
      .version('0.0.1')
      .option('-u, --user-id [id]', 'User ID token')
      .option('-k, --api-key [id]', 'API Key')
      .option('--folders <ids>', 'Comma-separated list of folder IDs', pushToArray(folders, true))
      .option('-d, --folder [id]', 'Folder to traverse (repeatable)', pushToArray(folders))
      .option('--files <ids>', 'Comma-separated list of file IDs', pushToArray(files, true))
      .option('-f, --file [id]', 'File to access (repeatable)', pushToArray(files))
      .option('-l, --list-contents', 'Just print contents of files or folders; don\'t store them')
      .option('-i, --by-id', 'List contents by ID, not name')
      .option('-p, --save-path [path]', 'Save file and folder contents to a filesystem path')
      .option('-h, ?, -?, --Help', 'Show help message', cli.help)
      .parse(process.argv);

    if (cli.listContents) {
        if ( cli.save ) {
            usage("Only one of --save and --list-contents must be specified");
        }
    } else if (cli.byId) {
        usage("--by-id is invalid unless --list-contents is supplied");
    } else if ( ! cli.savePath ) {
        usage("One of --save and --list-contents must be specified");
    }

    if ( ! ( cli.userId && cli.apiKey ) ) {
        usage("--userid and --apikey are required");
    }

    if ( folders.length && files.length ) {
        usage("Specifying both files and folders is not allowed");
    } else if ( ! folders.length + files.length ) {
        usage("At least one file or folder must be specified");
    }

    var path = validatePath(cli.savePath);

    return {
        apiKey: cli.apiKey,
        byID: cli.byId,
        files: files,
        folders: folders,
        save: path,
        userId: cli.userId,
    };
}

var options = parseArgs();

if (options.folders.length) {
    var cb = options.save ? function () {} : _.partialRight(displayFolderTrees, options.byID);
    getFolderTrees(options.userId, options.apiKey, options.folders, cb);
} else { // files mode

}