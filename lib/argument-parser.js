'use strict';

const _ = require('lodash'),
    ArgumentParser  = require('argparse').ArgumentParser,
    async = require('async'),
    colors = require('colors'),
    path = require('path'),
    fs = require('fs-extra');

// const eyes = require('eyes'), p = eyes.inspect.bind(eyes);

function validateDirectory(currentPath, raise) {
    const stat = _.attempt(fs.statSync, currentPath);
    if ( _.isError(stat) || ! stat.isDirectory() ) {
        raise(`Could not stat directory ${currentPath}; it may not exist:\n${stat}`);
    }

    const error = _.attempt(fs.accessSync, currentPath, fs.R_OK | fs.W_OK);
    if ( _.isError(error) ) {
        raise(`Could not get write access to directory ${currentPath}:\n${error}`);
    }
}

function validateSingleFile(currentPath, overwrite, raise) {
    // If the file exists, it must be writeable or creatable.
    let error = _.attempt(fs.accessSync, currentPath, fs.R_OK | fs.W_OK);
    if ( _.isError(error) ) {
        if ( error.errno === -2 ) { // ENOENT
            error = _.attempt(fs.accessSync, path.dirname(currentPath), fs.R_OK | fs.W_OK);
        }
        if ( _.isError(error) ) {
            raise(`Could not get write access to file ${currentPath}:\n${error}`);
        }
    } else if ( ! overwrite ) {
        if ( ! _.isError(error) ) {
            raise(`File ${currentPath} exists, and --overwrite is not set:\n${error}`);
        }
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

module.exports = function() {

    const multi = multiItemParser();
    let parser = new ArgumentParser({
            version: require('../package').version,
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
        usage = _.overArgs(_.bind(parser.error, parser), colors.red);

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
            help: 'API Key/Password Equivalent.',
            dest: 'apiKey',
            required: true
        }
    );

    // Save parser options.
    saveParser.addArgument(
        [ '-o', '--overwrite' ],
        {
            help: 'Overwrite files in destination path if they exist.',
            action: 'storeTrue',
            dest: 'overwrite',
        }
    );

    saveParser.addArgument(
        [ '-m', '--markdown' ],
        {
            help: 'Save markdown contents instead of full JSON metadata (like file and folder IDs).',
            action: 'storeTrue',
            dest: 'markdown',
        }
    );

    saveParser.addArgument(
        [ '-p', '--save-path', '--destination' ],
        {
            help: 'Path in which to save downloaded data. If more than one file and/or folder is specified for download, or if `DESTINATION` ends with a trailing slash, then `DESTINATION` must be an existent, writable, empty directory. Otherwise, it must be a nonexistent path inside an existent, writable directory.',
            dest: 'path',
            required: true,
        }
    );

    saveParser.addArgument(
        [ '--metadata' ],
        {
            help: 'Add .folder_metadata.json files next to any Classeur folders created. Usually only useful for backing up Classeur instances for later restore.',
            action: 'storeTrue',
            dest: 'folderMetadata',
        }
    );

    const args = parser.parseArgs();
    // TODO why is flattening necessary?
    args.folders = _.chain(args.folders || []).uniq().compact().flatten().value();
    args.files = _.chain(args.files || []).uniq().compact().flatten().value();
    const totalLength = args.folders.length + args.files.length;
    if ( ! totalLength ) {
        usage('At least one file or folder must be specified');
    }

    if ( args.folderMetadata && ! args.folders.length ) {
        usage('At least one folder is required for the --metadata option');
    }


    if (args.path) {
        // Only validate folders if we need a folder rather than a single file.
        if ( totalLength > 1 || args.folders.length || _.endsWith(args.path, path.sep) ) {
            validateDirectory(args.path, usage);
        } else {
            args.single = true;
            validateSingleFile(args.path, args.overwrite, usage);
        }
    }

    return args;
}