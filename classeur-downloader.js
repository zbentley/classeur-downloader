'use strict'

const _ = require('lodash'),
    ApiClient = require('classeur-api-client'),
    async = require('async'),
    fs = require('fs-extra'),
    pathMod = require('path'),
    pathJoin = _.spread(pathMod.join),
    TreeManipulator = require('tree-manipulator')

// const eyes = require('eyes'), p = eyes.inspect.bind(eyes)

/**
* Module for downloading and listing files and folders stored in [Classeur](http://classeur.io/).
*
* @example <caption>Installation</caption>
* npm install classeur-downloader
* @example <caption>Saving a single file's markdown content</caption>
* const downloader = require('classeur-downloader')
* downloader.saveSingleFile({
*     file: 'some file ID',
*     userId: 'user ID',
*     apiKey: 'api key',
*     path: '/some/path.md',
*     markdown: true
* }, (error) => {
*     if (error) throw error
* })
* @example <caption>Saving directories</caption>
* // Saves all files contained in 'folder1' and 'folder2' in subdirectories of mydir/ with those same names:
* downloader.saveTree({
*     folders: ['folder1', 'folder2' ]
*     userId: 'user ID',
*     apiKey: 'api key',
*     path: 'mydir/',
*     markdown: true
* }, (error) => {
*     if (error) throw error
* })
* @see The [README](index.html) for an overview and more usage examples.
* @see The [source code]{@link https://github.com/zbentley/classeur-downloader} on GitHub.
* @see The [classeur-api-client](http://zbentley.github.io/classeur-api-client/versions/latest) module (which `classeur-downloader` is built around) for a lower-level way to interact with the Classeur API.
* @module classeur-downloader
*/


function getTree(byId, print, items) {
    let props = {
        identifierProperty: byId ? 'id' : 'name',
        nestedNodesProperty: 'files',
    }
    if ( print ) {
        props.valueGetter = function(obj, property) {
            // If we're getting the value of a node, and not its children,
            // stringify it for pretty printing.
            if (property === this.identifierProperty) {
                return APIobjectToString(obj, byId)
            } else {
                return obj[property]
            }
        }
    }

    let tm  = new TreeManipulator(props)
    // If contents are supplied, bind the instance methods used by this script
    // to the contents to prevent having to pass around tree manipulators *and*
    // contents everywhere.
    if ( items !== undefined ) {
        _.mixin(tm, {
            print: _.partial(tm.print, items),
            findNode: _.partialRight(tm.findNode, items)
        })
    }

    return tm
}

function errorIfExists(path, cb) {
    fs.stat(path, (error, result) => {
        if (error && error.errno === -2) { //ENOENT
            cb(null, result)
        } else {
            cb(error || new Error(`File ${path} exists, and --overwrite is not set.`), null)
        }
    })
}

function getWriter(path, options, addExtension, content) {
    const writefunc = _.isString(content) ? fs.outputFile : fs.outputJson
    path = pathJoin(path)
    if ( addExtension ) {
        path += _.isString(content) ? '.md' : '.json'
    }

    return options.overwrite
        ? _.partial(writefunc, path, content)
        : _.partial(async.series, [
            _.partial(errorIfExists, path),
            _.partial(writefunc, path, content),
        ])
}

// For each item in the tree, either download it, or make the folder and recurse.
function makeFolderOrSaveFile(conn, tree, options, id, cb) {
    const found = tree.findNode(id),
        kids = tree.nestedNodesProperty,
        node = found.node,
        parallel = [],
        markdown = options.markdown

    let path = found.path

    if ( _.has(node, kids) ) {
        // Handle creation of folder metadata file only applies in JSON mode,
        // and only applies to non-root nodes.
        if ( options.folderMetadata && path.length > 1 ) {
            path[path.length - 1] += '.folder_metadata.json'
            parallel.push(getWriter(path, options, false, node))
        }

        parallel.push(_.partial(async.each, node[kids], (child, cb) => {
            makeFolderOrSaveFile(conn, tree, options, child[tree.identifierProperty], cb)
        }))
    } else {
        parallel.push(_.partial(async.waterfall,[
            _.bind(conn.getFile, conn, node.id),
            function(result, cb) {
                getWriter(path, options, options.addExtension, markdown ? result.content.text : result)(cb)
            }
        ]))
    }

    async.parallel(parallel, cb)
}


// Print a tree rooted at each folder and file. Printing the top-level tree
// results in leading \____ parent relationships for no reason.
function showTree(items, conn, options, cb) {
    const tm = getTree(options.byId, true)
    // TODO group by files vs. folders.
    _.forEach(_.sortBy(items, tm.identifierProperty), _.bind(tm.print, tm))
    cb(null, null)
}

function saveTree(items, conn, options, cb) {
    const path = options.path
    makeFolderOrSaveFile(conn, getTree(options.byId, false, {
        id: path,
        name: path,
        files: items // top-level folders and manually-specified files
    }), options, path, cb)
}

function APIobjectToString(object, byId) {
    if ( object.id || object.name ) {
        let info = [object.id, object.name]
        if ( byId ) info.reverse()
        return `${info.pop()} (${info.pop()})`
    } else {
        return ''
    }
}

function getFilesAndFolders(options, func, cb) {
    const conn = new ApiClient(options.userId, options.apiKey, options.host)
    async.parallel(
        [
            (cb) => { conn.getFolders(options.folders, cb) },
            (cb) => { conn.getFiles(options.files, cb) },
        ],
        (error, result) => {
            if (error) {
                if ( ! _.isError(error) ) {
                    error = new Error(error)
                }
                cb(error, null)
            } else {
                // _.flatten de-'segments' the array into a single list of files and folders.
                func(_.flatten(result), conn, options, cb)
            }
        }
    )
}

function assertOptions(options, maxFiles, maxFolders) {
    options.folders = options.folders || []
    options.files = options.files || []
    if ( ! _.isUndefined(maxFiles) && options.files.length > maxFiles ) {
        throw new Error(`Got ${options.files.length} files, but expected no more than ${maxFiles}:\n${options.files}`)
    }

    if ( ! _.isUndefined(maxFolders) && options.folders.length > maxFolders ) {
        throw new Error(`Got ${options.folders.length} folders, but expected no more than ${maxFolders}:\n${options.folders}`)
    }

    if ( _.isUndefined(options.addExtension) ) {
        options.addExtension = true
    }

    return options
}

function scrubCallback(cb) {
    return (error, result) => {
        result = _.compact(_.flattenDeep(result))
        cb(error || null, _.isEmpty(result) ? null : result)
    }
}

/**
* Options for configuring `classeur-downloader`.
* @typedef {Object} Options:Global
* @property {String} userId - User ID with which to connect to the Classeur API.
* @property {String} apiKey - API key to use when connecting to the Classeur API. This can be obtained by re-generating your key in the Classeur 'User' preferences pane.
* @property {String[]} [files] - Array of file IDs to operate on.
* - At least one value must be supplied in `options.files` or `options.folders`, otherwise an error will be raised.
* @property {String[]} [folders] - Array of folder IDs to operate on.
* - At least one value must be supplied in `options.files` or `options.folders`, otherwise an error will be raised.
* @property {boolean} [byId=false] - If true, files and folders will be handled (saved or printed) by ID. If false, they will be handled by Classeur human-readable name.
*/

/**
* Options for configuring the bulk download behavior of `classeur-downloader`.
* All options used by {@link module:classeur-downloader~Options:Global} are also accepted.
* @typedef {Object} Options:DownloadFilesAndFolders
* @property {String} path - Destination path to save files and folders from Classeur. `path` must be an existent, writable folder.
* - All files in `options.files` will be saved inside of `path`. All folders in the `options.folders` will be created (with names according to the `byId` property) in `path`, and the files they contain will be created within those folders.
* - If `options.overwrite` is not set and name collisions occur with files being saved into `path`, an error will be raised and save operations will halt. Partial results may exist on the filesystem.
* @property {boolean} [overwrite=false] - If true, items in `path` that already exist will be overwritten.
* @property {boolean} [folderMetadata=false] - If true, generate JSON folder metadata for all folders in `folders`.
* - If `true`, a single JSON file will be created next to every Classeur folder downloaded. That JSON file will be named after the folder, and will end in `.folder_metadata.json`. It will contain the full Classeur API metadata information for the folder. This is usually not useful, unless you are using `classeur-downlaoder` to back up a locally-hosted Classeur instance with the intent of using the generated files for some future restoration process.
* @property {boolean} [markdown=false] - Whether or not to write markdown content for files.
* - If `true`, saved files' content will be the markdown content of Classeur documents.
* - If `false`, files' content will be their full JSON data from Classeur. Full JSON data objects include markdown content and other fields, and will likely not be able to be opened directly in a Markdown editor.
* @property {boolean} [addExtension=true] - Whether or not appropriate extensions should be added to files written.
* - If `true`, files saved with `options.markdown` set to `true` will have the `.md` extension, and files saved outside of `markdown` mode will have the `.json` extension.
* - If false, extensions will not be added to files.
*/

/**
* Options for configuring the single-file download behavior of `classeur-downloader`.
* All options used by {@link module:classeur-downloader~Options:Global} are also accepted.
* @typedef {Object} Options:DownloadSingleFile
* @property {String} path - Destination path to save files and folders from Classeur. Must be either a nonexistent path in a writable directory, or an existent, writable file (if `options.overwrite` is set).
* @property {String} [file=options.files[0]] - Single file ID to download and save. If not provided, `options.files[0]` will be used.
* - This option is mutually exclusive with `options.files`.
* @property {boolean} [overwrite=false] - If true, `path` will be overwritten with the new Classeur file content retrieved.
* @property {boolean} [markdown=false] - Whether or not to write markdown content for `options.file`.
* - If `true`, `options.file`'s content will be that file's markdown content, visible in the Classeur UI.
* - If `false`, `options.file`'s content will be its full JSON data from Classeur. Full JSON data objects include markdown content and other fields, and will likely not be able to be opened directly in a Markdown editor.
*/

/**
* @callback CompletionCallback
* @param {Error?} error - An throwable Error (or subclass thereof) if an error occurrend.
* - For errors in writing files, `error` may be any of the errors raised by the [fs](https://nodejs.org/api/fs.html) module.
* - For errors retrieving data from the Classeur API, `error` may be one of the Error subclasses used by [classeur-api-client](http://zbentley.github.io/classeur-api-client/versions/latest). Errors will be supplied to `CompletionCallback`s in the same way they will be supplied to [ClasseurClient~ScrubbedCallback](http://zbentley.github.io/classeur-api-client/versions/latest/module-classeur-api-client.html#.ScrubbedCallback)s.
* - `error` will always be `null` (not `undefined` or another falsy value) if no error occurred.
* @param {*?} result - Behavior of `result` is not defined it should not be used. Will usually be `null`. May sometimes contain an array of partial result objects.
*/

/**
* @summary Prints out (to the console) a tree structure of the Classeur hierarchy of supplied files and folders.
* @param {module:classeur-downloader~Options:Global} options - Options for which Classeur files and folders to retrieve, and how to display them.
* - Folders in the `options.folders` will be printed as root directories, and all of the files they contain will be printed.
* - If the `options.byId` is `true`, files and folders will be printed out as 'id (name)'. Otherwise, they will be printed as 'name (id)', where 'name' is the human-readable name of an object in the Classeur UI.
* @param {module:classeur-downloader~CompletionCallback} callback - Called with an error, if one occurred, or `null` if all operations were successful.
*/
module.exports.showTree = (options, cb) => {
    getFilesAndFolders(assertOptions(options), showTree, scrubCallback(cb))
}

/**
* Folders in the `options.folders` array will be saved as root directories (with names determined by the presence or absence of `options.byId`), and all of the files they contain will be saved within them. Files in `options.files` will be saved at the top level.
* If the `options.byId` is `true`, files and folders' root names will be their Classeur object IDs. Extensions will be added regardless of `options.byId`, depending on the value of `options.addExtension`.
* @summary Saves Classeur files and folders to a specified path on the local filesystem.
* @param {module:classeur-downloader~Options:DownloadFilesAndFolders} options - Options for which Classeur files and folders to retrieve, and how to save them.
* @param {module:classeur-downloader~CompletionCallback} callback - Called with an error, if one occurred, or `null` if all operations were successful.
*
* @example <caption>Saving files by ID</caption>
* // Assume the folder with ID 'abcd' contains files with the IDs 'foo', 'bar', and 'baz'.
* const downloader = require('classeur-downloader')
* downloader.saveTree({
*     files: [ 'quux' ],
*     folders: [ 'abcde' ],
*     userId: 'user ID',
*     apiKey: 'api key',
*     path: 'mydir/',
*     folderMetadata: true
* }, (error) => { if (error) throw error })
* // 'mydir' will now contain:
* //    quux.json
* //    abcde.folder_metadata.json
* //    abcde
* //        \_ foo.json
* //        \_ bar.json
* //        \_ baz.json
*
* @example <caption>Saving markdown content</caption>
* // Assume the folder with ID 'abcd' has the UI-visible name 'My Folder'.
* // Assume it contains two files with IDs 'foo' and 'bar', and the names 'My Stuff' and 'My Other Stuff'.
* downloader.saveTree({
*     folders: [ 'abcde' ],
*     userId: 'user ID',
*     apiKey: 'api key',
*     path: 'mydir/'
*     markdown: true
* }, (error) => { if (error) throw error })
* // 'mydir' will now contain:
* //    My Folder
* //        \_ My Stuff.md
* //        \_ My Other Stuff.md
*/
module.exports.saveTree = (options, cb) => {
    getFilesAndFolders(assertOptions(options), saveTree, scrubCallback(cb))
}

/**
* This function can be used when you don't need/want to create container folders for your retrieved Classeur content.
* @summary Saves a single Classeur file to a specified path on the local filesystem.
* @param {module:classeur-downloader~Options:DownloadSingleFile} options
* - `options.folders` may not be supplied to this function.
* - `options.byId` is ignored by this function.
* - File content will be saved directly to `options.path` no folders or other metadata files will be created.
* - File extensions (e.g. `.md`) will _not_ be added by SaveSingleFile write the extension you want into `options.path` directly.
* @param {module:classeur-downloader~CompletionCallback} callback - Called with an error, if one occurred, or `null` if all operations were successful.
*
* @example <caption>Saving a single file's markdown content</caption>
* const downloader = require('classeur-downloader')
* downloader.saveSingleFile({
*     files: 'some file id',
*     userId: 'user ID',
*     apiKey: 'api key',
*     path: 'myfile.markdown',
*     markdown: true
* }, (error) => { if (error) throw error })
*/
module.exports.saveSingleFile = (options, cb) => {
    options = assertOptions(options, 1, 0)
    const conn = new ApiClient(options.userId, options.apiKey, options.host),
        ext = pathMod.parse(options.path).ext
    async.waterfall([
        _.bind(conn.getFile, conn, options.file || options.files[0]),
        (result, cb) => {
            getWriter([options.path], options, false, options.markdown ? result.content.text : result)(cb)
        }
    ], scrubCallback(cb))
}