# Developer's Guide

Pull requests are welcome! Pull the [source code](https://github.com/zbentley/classeur-downloader) and hack away.

## Tests

Tests are a work in progress now, and will be released soon.

## Documentation

### Building the Main Documentation

Documentation is generated, and, optionally, pushed to GitHub pages via a [grunt](gruntjs.com)-based build process. Generated documentation is placed in `doc/generated`. **The `doc/generated` folder will be removed and re-created as part of any documentation build.**

To generate documentation from the [JSDoc](http://usejsdoc.org/) in the code, do `grunt doc:master` or `grunt doc:current-version`. The names of the two functions are a bit deceptive: both will generate documentation from the branch and version of the module from which you are running `grunt`. The difference is that the former places the documentation into the `doc/generated/master` file, and the latter places it in the `doc/generated/$version` file, where `$version` is the NPM package version from `package.json`.

### Building the Version Index Documentation

`grunt doc:index` can be used to build just the documentation landing page, which contains links to multiple module versions' documentation. `grunt doc:index` is implied as part of all other `grunt doc` tasks.

The index will live in `doc/generated/index.html`. Unless you build a version's documentation in addition to the index, links in the index will not work.

### Pushing Documentation to GitHub Pages

You can add `:push` to either the `doc:master` or `doc:current-version` Grunt task to push the resulting documentation product to GitHub pages, e.g. `grunt doc:master:push`.

Before pushing, the build system will delete and re-create the index documentation (regardless of target), and documentation for the version-named (or `master`-named) folder you are targeting, depending on which Grunt task you're pushing with.