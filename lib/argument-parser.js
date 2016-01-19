'use strict';

const _ = require('lodash'),
    ArgumentParser  = require('argparse').ArgumentParser,
    async = require('async'),
    colors = require('colors'),
    fs = require('fs-extra');

// const eyes = require('eyes'), p = _.bind(eyes.inspect, eyes);

function validatePath(path, raise) {
    const stat = _.attempt(fs.statSync, path);
    if ( ! (stat instanceof fs.Stats) || ! stat.isDirectory() ) {
        raise(`Could not stat directory ${path}; it may not exist:\n${stat}`);
    }

    const error = _.attempt(fs.accessSync, path, fs.R_OK | fs.W_OK);
    if ( error ) {
        raise(`Could not get write access to directory ${path}:\n${error}`);
    }
    return path;
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