'use strict';

const _ = require('lodash'),
    ApiClient = require('../api'),
    async = require('async'),
    fs = require('fs-extra'),
    pathJoin = _.spread(require('path').join),
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
            cb(error || new Error(`File ${path} exists!`), null);
        }
    });
}

function getWriter(path, content) {
    const writefunc = _.isString(content) ? fs.outputFile : fs.outputJson;
    path = pathJoin(path);
    path += _.isString(content) ? '.md' : '.json';

    return _.partial(async.series, [
        _.partial(errorIfExists, path),
        _.partial(writefunc, path, content),
    ]);
}

// For each item in the tree, either download it, or make the folder and recurse.
function makeFolderOrSaveFile(conn, tree, markdown, id, cb) {
    const found = tree.findNode(id),
        kids = tree.nestedNodesProperty,
        node = found.node,
        parallel = [];
    let path = found.path;

    if ( _.has(node, kids) ) {
        // Handle creation of folder metadata file; only applies in JSON mode,
        // and only applies to non-root nodes.
        if ( ! markdown && path.length > 1 ) {
            path[path.length - 1] += '.folder_metadata';
            parallel.push(getWriter(path, node));
        }

        parallel.push(_.partial(async.each, node[kids], function (child, cb) {
            makeFolderOrSaveFile(conn, tree, markdown, child[tree.identifierProperty], cb);
        }));
    } else {
        parallel.push(_.partial(async.waterfall,[
            _.bind(conn.getFile, conn, node.id),
            function(result, cb) {
                getWriter(path, markdown ? result.content.text : result)(cb);
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
    const path = options.save,
        singleFileOnly = ( ! options.folders || options.folders.length === 0) && options.files && options.files.length === 1,
        tm = singleFileOnly
            ? getTree(options.byId, false, {
                id: options.files[0],
                name: path
            })
            : getTree(options.byId, false, {
                id: path,
                name: path,
                files: items // top-level folders and manually-specified files
            });

    makeFolderOrSaveFile(conn, tm, options.markdown, path, cb);
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

module.exports.showTree = function(options, cb) {
    getFilesAndFolders(options, showTree, cb);
}

module.exports.saveTree = function(options, cb) {
    getFilesAndFolders(options, saveTree, cb);
}