'use strict';

const _ = require('lodash'),
    ApiClient = require('../api'),
    async = require('async'),
    fs = require('fs-extra'),
    pathMod = require('path'),
    pathJoin = _.spread(pathMod.join),
    TreeManipulator = require('tree-manipulator');

const eyes = require('eyes'), p = _.bind(eyes.inspect, eyes);

/**
* Module for downloading or displaying files and folders from [Classeur](http://classeur.io/)
*
* @example <caption>Installation</caption>
* npm install classeur-downloader
* @example <caption>Usage</caption>
* const classeurDownload = require('classeur-downloader');
*
* classeurDownload({
* 
* }, (error, result) => {
* 
* });
* @see The [ClasseurClient]{@link module:classeur-api-client~ClasseurClient} class for API usage information.
* @see The [README](index.html) for an overview and more usage examples.
* @see The [source code]{@link https://github.com/zbentley/classeur-api-client} on GitHub.
* @module classeur-api-client
*/


function getTree(byId, print, items) {
    let props = {
        identifierProperty: byId ? 'id' : 'name',
        nestedNodesProperty: 'files',
    };
    if ( print ) {
        props.valueGetter = function(obj, property) {
            // If we're getting the value of a node, and not its children,
            // stringify it for pretty printing.
            if (property === this.identifierProperty) {
                return APIobjectToString(obj, byId);
            } else {
                return obj[property];
            }
        };
    }

    let tm  = new TreeManipulator(props);
    // If contents are supplied, bind the instance methods used by this script
    // to the contents to prevent having to pass around tree manipulators *and*
    // contents everywhere.
    if ( items !== undefined ) {
        _.mixin(tm, {
            print: _.partial(tm.print, items),
            findNode: _.partialRight(tm.findNode, items)
        });
    }

    return tm;
}

function errorIfExists(path, cb) {
    fs.stat(path, (error, result) => {
        if (error && error.errno === -2) { //ENOENT
            cb(null, result);
        } else {
            cb(error || new Error(`File ${path} exists, and --overwrite is not set.`), null);
        }
    });
}

function getWriter(path, options, content) {
    const writefunc = _.isString(content) ? fs.outputFile : fs.outputJson;
    path = pathJoin(path);
    if ( ! options.norename ) {
        path += _.isString(content) ? '.md' : '.json';
    }

    return options.overwrite
        ? _.partial(writefunc, path, content)
        : _.partial(async.series, [
            _.partial(errorIfExists, path),
            _.partial(writefunc, path, content),
        ]);
}

// For each item in the tree, either download it, or make the folder and recurse.
function makeFolderOrSaveFile(conn, tree, options, id, cb) {
    const found = tree.findNode(id),
        kids = tree.nestedNodesProperty,
        node = found.node,
        parallel = [],
        markdown = options.markdown;

    let path = found.path;

    if ( _.has(node, kids) ) {
        // Handle creation of folder metadata file; only applies in JSON mode,
        // and only applies to non-root nodes.
        if ( ! markdown && path.length > 1 ) {
            path[path.length - 1] += '.folder_metadata';
            parallel.push(getWriter(path, options, node));
        }

        parallel.push(_.partial(async.each, node[kids], (child, cb) => {
            makeFolderOrSaveFile(conn, tree, options, child[tree.identifierProperty], cb);
        }));
    } else {
        parallel.push(_.partial(async.waterfall,[
            _.bind(conn.getFile, conn, node.id),
            function(result, cb) {
                getWriter(path, options, markdown ? result.content.text : result)(cb);
            }
        ]));
    }

    async.parallel(parallel, cb);
}


// Print a tree rooted at each folder and file. Printing the top-level tree
// results in leading \____ parent relationships for no reason.
function showTree(items, conn, options, cb) {
    const tm = getTree(options.byId, true);
    // TODO group by files vs. folders.
    _.forEach(_.sortBy(items, tm.identifierProperty), _.bind(tm.print, tm));
    cb(null, null);
}

function saveTree(items, conn, options, cb) {
    const path = options.path;
    makeFolderOrSaveFile(conn, getTree(options.byId, false, {
        id: path,
        name: path,
        files: items // top-level folders and manually-specified files
    }), options, path, cb);
}

function APIobjectToString(object, byId) {
    if ( object.id || object.name ) {
        let info = [object.id, object.name];
        if ( byId ) info.reverse();
        return `${info.pop()} (${info.pop()})`;
    } else {
        return '';
    }
}

function getFilesAndFolders(options, func, cb) {
    const conn = new ApiClient(options.userId, options.apiKey, options.host);
    async.parallel(
        [
            (cb) => { conn.getFolders(options.folders, cb); },
            (cb) => { conn.getFiles(options.files, cb); },
        ],
        (error, result) => {
            if (error) {
                if ( ! _.isError(error) ) {
                    error = new Error(error);
                }
                cb(error, null);
            } else {
                // _.flatten de-"segments" the array into a single list of files and folders.
                func(_.flatten(result), conn, options, cb);
            }
        }
    );
}

function assertOptions(options, maxFiles, maxFolders) {
    options.folders = options.folders || [];
    options.files = options.files || [];
    if ( ! _.isUndefined(maxFiles) && options.files.length > maxFiles ) {
        throw new Error(`Got ${options.files.length} files, but expected no more than ${maxFiles}:\n${options.files}`);
    }

    if ( ! _.isUndefined(maxFolders) && options.folders.length > maxFolders ) {
        throw new Error(`Got ${options.folders.length} files, but expected no more than ${maxFolders}:\n${options.folders}`);
    }

    return options;
}

module.exports.showTree = (options, cb) => {
    getFilesAndFolders(assertOptions(options), showTree, cb);
}

module.exports.saveTree = (options, cb) => {
    getFilesAndFolders(assertOptions(options, 1, 0), saveTree, cb);
}

module.exports.saveSingleFile = (options, cb) => {
    const conn = new ApiClient(options.userId, options.apiKey, options.host),
        ext = pathMod.parse(options.path).ext;
    options.norename = true;
    async.waterfall([
        _.bind(conn.getFile, conn, options.file || options.files[0]),
        (result, cb) => {
            getWriter([options.path], options, options.markdown ? result.content.text : result)(cb);
        }
    ]);
}