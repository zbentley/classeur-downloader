#!/usr/bin/env node

var _ = require('lodash');
var ArgumentParser  = require('argparse').ArgumentParser;
var async = require('async');
var colors = require('colors');
var Connection = require('classeur-api-client');
var fs = require('fs-extra');
var pathJoin = _.spread(require('path').join);
var sprintf = require('sprintf').sprintf;
var TreeManipulator = require('tree-manipulator');

function treeManipulator(byId, print, items) {
    var props = {
        identifierProperty: byId ? 'id' : 'name',
        nestedNodesProperty: "files",
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

    var tm  = new TreeManipulator(props);
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
            cb(err || "File exists!", null);
        }
    });
}

// Print a tree rooted at each folder and file. Printing the top-level tree
// results in leading \____ parent relationships for no reason.
function showTree(items, byId) {
    var tm = treeManipulator(byId, true);
    // TODO group by files vs. folders.
    _.forEach(_.sortBy(items, tm.identifierProperty), _.bind(tm.print, tm));
}

function getWriter(path, content) {
    var writefunc = _.isString(content) ? fs.outputFile : fs.outputJson;
    path = pathJoin(path);
    path += _.isString(content) ? ".md" : ".json";

    return _.partial(async.series, [
        _.partial(errorIfExists, path),
        _.partial(writefunc, path, content),
    ]);
}

// For each item in the tree, either download it, or make the folder and recurse.
function makeFolderOrSaveFile(conn, tree, markdown, id, cb) {
    var found = tree.findNode(id),
        path = found.path,
        kids = tree.nestedNodesProperty,
        node = found.node,
        parallel = [];

    if ( _.has(node, kids) ) {
        // Handle creation of folder metadata; only applies in JSON mode, and only applies to non-root nodes.
        if ( ! markdown && path.length > 1 ) {
            path[path.length - 1] += ".folder_metadata";
            parallel.push(getWriter(path, node));
        }

        parallel.push(_.partial(async.each, node[kids], function (child, cb) {
            makeFolderOrSaveFile(conn, tree, markdown, child[tree.identifierProperty], cb);
        }));
    } else {
        parallel.push(_.partial(async.waterfall,[
            _.bind(conn.getFile, conn, node.id),
            function(result, cb) {
                var content = markdown ? result.content.text : result;
                getWriter(path, content)(cb);
            }
        ]));
    }

    async.parallel(parallel, cb);
}

function saveTree(items, conn, byId, path, markdown, cb) {
    var tm = treeManipulator(byId, false, {
        id: path,
        name: path,
        files: items // top-level folders and manually-specified files
    });
    makeFolderOrSaveFile(conn, tm, markdown, path, cb);
}

function validatePath(path, raise) {
    var stat = _.attempt(fs.statSync, path);
    if ( ! (stat instanceof fs.Stats) || ! stat.isDirectory() ) {
        raise(sprintf('Could not stat directory %s; it may not exist:\n%s', path, stat));
    }

    var error = _.attempt(fs.accessSync, path, fs.R_OK | fs.W_OK);
    if ( error ) {
        raise(sprintf('Could not get write access to directory %s:\n%s', path, error));
    }
    return path;
}

function APIobjectToString(object, byId) {
    if ( object.id || object.name ) {
        return sprintf(
            '%s (%s)',
            byId ? object.id : object.name,
            byId ? object.name : object.id
        );
    } else {
        return '';
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
            metavar: 'folderid'
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
            dest: 'userId',
            required: true
        }
    );

    parser.addArgument(
        [ '-k', '--api-key' ],
        {
            help: 'API Key/Password Analogue',
            dest: 'apiKey',
            required: true
        }
    );

    var subparsers = parser.addSubparsers({
      title: 'subcommands',
      dest: 'subcommand'
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

    var args = parser.parseArgs(),
        folders = args.folders || [],
        files = args.files || [];

    // TODO why is flattening necessary?
    files = _.chain(files).uniq().compact().flatten().value()
    folders = _.chain(folders).uniq().compact().flatten().value()

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

var options = parseArgs(),
    conn = new Connection({
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
