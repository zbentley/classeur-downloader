#!/usr/bin/env node
'use strict';

const _ = require('lodash'),
    ArgumentParser  = require('argparse').ArgumentParser,
    async = require('async'),
    colors = require('colors'),
    ApiClient = require('classeur-api-client'),
    fs = require('fs-extra'),
    pathJoin = _.spread(require('path').join),
    TreeManipulator = require('tree-manipulator');

function treeManipulator(byId, print, items) {
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

function fatal(cb) {
    return function(error, result) {
        if (error) {
            throw error;
        } else {
            cb(result);
        }
    }
}

function errorIfExists(path, cb) {
    fs.stat(path, function(err, result) {
        if (err && err.errno === -2) {
            cb(null, result);
        } else {
            cb(err || 'File exists!', null);
        }
    });
}

// Print a tree rooted at each folder and file. Printing the top-level tree
// results in leading \____ parent relationships for no reason.
function showTree(items, byId) {
    const tm = treeManipulator(byId, true);
    // TODO group by files vs. folders.
    _.forEach(_.sortBy(items, tm.identifierProperty), _.bind(tm.print, tm));
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

function saveTree(items, conn, byId, path, markdown, cb) {
    const tm = treeManipulator(byId, false, {
        id: path,
        name: path,
        files: items // top-level folders and manually-specified files
    });
    makeFolderOrSaveFile(conn, tm, markdown, path, cb);
}

function validatePath(path, raise) {
    const stat = _.attempt(fs.statSync, path);
    if ( ! (stat instanceof fs.Stats) || ! stat.isDirectory() ) {
        raise(`'Could not stat directory ${path}; it may not exist:\n${stat}`);
    }

    const error = _.attempt(fs.accessSync, path, fs.R_OK | fs.W_OK);
    if ( error ) {
        raise(`Could not get write access to directory ${path}:\n${error}`);
    }
    return path;
}

function APIobjectToString(object, byId) {
    if ( object.id || object.name ) {
        return `${byId ? object.id : object.name} (${byId ? object.name : object.id})`;
    } else {
        return '';
    }
}

function multiItemParser() {
    let parser = new ArgumentParser({
        addHelp: false
    });
    parser.addArgument(
        ['-d', '--folders'],
        {
            action: 'append',
            dest: 'folders',
            nargs: '+',
            metavar: 'folderid'
        }
    );

    parser.addArgument(
        ['-f', '--files'],
        {
            action: 'append',
            dest: 'files',
            nargs: '+',
            metavar: 'fileid'
        }
    );

    parser.addArgument(
        ['--by-id'],
        {
            action: 'storeTrue',
            dest: 'byId'
        }
    );
    return parser;
}

function parseArgs() {

    const multi = multiItemParser();
    let parser = new ArgumentParser({
            version: '0.0.1',
            addHelp:true,
            description: 'Argparse example'
        }),
        subparsers = parser.addSubparsers({
          title: 'subcommands',
          dest: 'subcommand'
        }),
        saveParser = subparsers.addParser('save', {
            addHelp: true,
            parents: [multi],
        });

    const listParser = subparsers.addParser('list', {
            addHelp: true,
            parents: [multi],
        }),
        usage = _.modArgs(_.bind(parser.error, parser), colors.red);

    parser.addArgument(
        [ '-u', '--user-id' ],
        {
            help: 'User ID token',
            dest: 'userId',
            required: true
        }
    );

    parser.addArgument(
        [ '-k', '--api-key' ],
        {
            help: 'API Key/Password Equivalent',
            dest: 'apiKey',
            required: true
        }
    );

    saveParser.addArgument(
        [ '-m', '--markdown' ],
        {
            help: 'Save markdown contents instead of full JSON metadata (like file and folder IDs)',
            action: 'storeTrue',
            dest: 'markdown',
        }
    );

    saveParser.addArgument(
        [ '-p', '--save-path', '--destination' ],
        {
            help: 'Save file and folder contents to a filesystem path',
            dest: 'path',
            required: true,
        }
    );

    const args = parser.parseArgs();
    // TODO why is flattening necessary?
    const folders = _.chain(args.folders || []).uniq().compact().flatten().value(),
        files = _.chain(args.files || []).uniq().compact().flatten().value();

    if ( ! ( folders.length || files.length ) ) {
        usage('At least one file or folder must be specified');
    }

    return {
        apiKey: args.apiKey,
        byId: args.byId,
        files: files,
        folders: folders,
        markdown: args.markdown,
        save: args.path ? validatePath(args.path, usage) : null,
        userId: args.userId
    };
}

const options = parseArgs(),
    conn = new ApiClient({
        host: 'app.classeur.io',
        userId: options.userId,
        apiKey: options.apiKey
    }),
    action = options.save
        ? _.partial(saveTree, _, conn, options.byId, options.save, options.markdown)
        : _.partialRight(showTree, options.byId);

async.parallel(
    [
        _.bind(conn.getFolders, conn, options.folders),
        _.bind(conn.getFiles, conn, options.files)
    ],
    fatal(_.modArgs(action, _.flatten))
);
