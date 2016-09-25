# classeur-downloader

Script to download files and folders from http://classeur.io/
[![npm version](https://badge.fury.io/js/classeur-downloader.svg)](https://www.npmjs.com/package/classeur-downloader)

[Classeur](http://classeur.io/) is an online writing and collaboration platform by the creators of [StackEdit](https://stackedit.io/). Documents created and shared within Classeur are stored in HTML local storage and in Classeur's cloud/servers. `classeur-downloader` can be used to download files and folders out of Classeur and onto a local filesystem.

This module is built around [classeur-api-client](http://zbentley.github.io/classeur-api-client/versions/latest).

# Documentation and Sources

Documentation for this module (both the module API and the `cldownload` script) is available on [GitHub pages](http://zbentley.github.io/classeur-downloader/versions/latest). For documentation on older or unreleased package versions, go [here](http://zbentley.github.io/classeur-downloader).

Source code for this package is avaiable at [https://github.com/zbentley/classeur-downloader](https://github.com/zbentley/classeur-downloader).

# Installation

You can install the downloader script and library globally:

```bash
npm install -g classeur-downloader
cldownload --help
```

...Or locally:

```bash
npm install classeur-downloader
./node_modules/.bin/cldownload --help
```

# Usage

## Command-line Interface

```bash
cldownload [global options] list|save [subcommand options]
```

The `cldownload` CLI operates over any number of Classeur files or folders, has two modes of operation: `list` (display a tree of file names and IDs retrieved) and `save` (save files and folders to the filesystem).

The below examples all assume you are using a globally-installed copy of `classeur-downloader`. If you are running it locally, use the local path (usually `node_modules/.bin/cldownloader`) where appropriate.

Options are detected by the shortest unambiguous substring, so `--file` works just as well as `--files`.

All options have short versions or synonyms. Use the various `--help` flags to see valid option names.

### Examples

```perl
# Save markdown content of all files in two folders to a directory:
cldownload --user-id 'my id' --api-key 'my key' save --folders 'folder id 1' 'folder id 2' --save-path /path/to/dir --markdown

# Save the full Classeur API metadata and data for a file into a single JSON document:
cldownload --user-id 'my id' --api-key 'my key' save --file 'file id' --save-path /path/to/a/file.json

# Print out a tree of all files in a given folder:
cldownload --user-id 'my id' --api-key 'my key' list --folder 'folder id'

# Global help:
cldownload --help

# Subcommand-specific help:
cldownload list --help
cldownload save --help
```

### Global Options

The following options apply to all subcommands and should be specified before the subcommand name.

- `--user-id ID` (String)
    - Classeur user ID to use when connecting to the REST API.
- `--api-key KEY` (String)
    - Classeur user API key (visible only once, in the web UI wen generated) to use when connecting to the REST API.
- `--help`
	- Print the help message for global options and subcommand names, and then exit.
- `--version`
	- Print the version of the `cldownload` script and associated NPM package, and then exit.

### `'save'` Subcommand Options

- `--destination DESTINATION` (Path; must be nonexistent or an empty directory)
	- Path in which to save downloaded data. If more than one file and/or folder is specified for download, or if `DESTINATION` ends with a trailing slash, then `DESTINATION` must be an existent, writable, directory. Otherwise, it must be a nonexistent path inside an existent, writable directory.
	- If `--overwrite` is not set and `DESTINATION` is a directpry, `DESTINATION` should empty; otherwise name collisions will cause an error, and partial results may be written into the directory.
- `--folders FOLDER_ID_1 FOLDER_ID_2 ...` (One or more strings)
    - Folder(s) to download. Each folder will be created (in parallel) inside of `DESTINATION`, with either the name visible in the Classeur UI or the folder ID (depending on the `--by-id` setting). All files inside each folder will then be downloaded into that directory.
- `--files FILE_ID_1 FILE_ID_2 ...` (One or more strings)
    - File(s) to download. Each file will be downloaded (in parallel) and placed in the appropriate folder inside of `DESTINATION`, with either the name visible in the Classeur UI or the folder ID (depending on the `--by-id` setting).
    - If a single file ID and no folders are supplied to `cldownload`, `DESTINATION` will be written to as a file, not a directory, unless `DESTINATION` ends with a trailing slash. In this mode, a file extension (`.md` or `.json`) will not be appended to the downloaded file.
- `--by-id`
	- If set, files and folders will be created in `DESTINATION` with names corresponding to their Classeur IDs rather than their UI-visible names.
- `--overwrite`
	- If set, files with the same names as ones already in `DESTINATION` will be overwritten.
	- If not set, errors will be raised when name conflicts occur. However, partial results may still be written to paths without name conflicts.
- `--markdown`
	- If set, extensions of downloaded files will be `.md`, and the content of each downloaded file will be the markdown content of the Classeur document that file represents, as visible in the UI.
	- If not set, extensions of downloaded files will be `.json`, and the content of each downloaded file will be the full JSON information for that document from the Classeur REST API. The full information contains the markdown content as well as other metadata fields, so it cannot be opened in another Markdown editor without modification.
	- File extensions are not added if the only a single file is being downloaded directly to a file path, and is not being placed in a directory. See `--files` for more info.
- `--help`
	- Print the help message for the `save` subcommand, and then exit.

### `'list'` Subcommand Options
- `--help`
	- Print the help message for the `list` subcommand, and then exit.
- `--folders FOLDER_ID_1 FOLDER_ID_2 ...` (One or more strings)
    - Folder(s) to list. Each folder will be printed at the root of a tree of the files it contains.
    - How each folder is displayed depends on whether or not `--by-id` is set.
- `--files FILE_ID_1 FILE_ID_2 ...` (One or more strings)
    - File(s) to list. Each file will be printed out at the root level, alongside any folders. Folders' content will be nested below them, but explicitly specified files will not (even if a folder which also contains an explicitly specified file is also specified).
    - How each file is displayed depends on whether or not `--by-id` is set.
- `--by-id`
	- If set, files and folders will be displayed with their Classeur object IDs first, and their UI-visible names in parentheses.
	- If not set, files and folders will be displayed with their UI-visible names first, and their Classeur object IDs in parentheses.

## [Module API](http://zbentley.github.io/classeur-downloader/versions/latest/module-classeur-downloader.html)

`cldownload` is a thin wrapper around the underlying `classeur-downloader` [module API](http://zbentley.github.io/classeur-downloader/versions/latest/module-classeur-downloader.html). That API can be used directly. For example, to get all files in a folder, do the following:

```javascript
const downloader = require('classeur-downloader');

// Saves all files contained in 'folder1' and 'folder2' in subdirectories of mydir/ with those same names:
downloader.saveTree({
	folders: ['folder1', 'folder2' ]
	userId: 'user ID',
	apiKey: 'api key',
	path: 'mydir/',
	markdown: true
}, (error) => {
	if (error) throw error;
});
```

For complete documentation (generated via [JSDoc](usejsdoc.org) embedded in this module's code), go to [GitHub pages](http://zbentley.github.io/classeur-downloader/versions/latest/module-classeur-downloader.html). For documentation on older or unreleased package versions, go [here](http://zbentley.github.io/classeur-downloader).

## Using IDs

The REST API operates only by ID. You cannot get any information by human-visible name; you have to use the object IDs of files and folders to retrieve them using `classeur-downloader`. The IDs of files are visible in the URI bar of Classeur (if you are using Classeur in a browser). IDs of other objects, including files, are visible via the 'properties' windows of those objects in the Classeur UI.

# Making Changes

See the [Developer's Guide](https://github.com/zbentley/classeur-downloader/blob/master/doc/tutorials/DeveloperGuide.md) for more info.

NPM package versions will follow [Semantic Versioning](http://semver.org/).

# Bugs

File a GitHub issue on the [main repository](https://github.com/zbentley/classeur-downloader).

# Release Notes

Release notes are available [here](http://zbentley.github.io/classeur-downloader/versions/latest/tutorial-VersionIndex.html), under the "Release Notes" heading.