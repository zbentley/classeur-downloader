# classeur-api-client

This is the documentation landing page for `classeur-api-client`, a node.js client for the REST API of [http://classeur.io/](http://classeur.io/).

Source code for this package is avaiable at [https://github.com/zbentley/classeur-downloader](https://github.com/zbentley/classeur-downloader).

Select a version of this library below to get started.

# Versions

NPM package versions will follow [Semantic Versioning](http://semver.org/).

Each link below will take you to the README for the given package version:

- [latest stable](<%- path %>versions/latest/index.html)
- [0.1.0](<%- path %>versions/0.1.0/index.html) (links to 0.1.1 documentation)
- [0.1.1](<%- path %>versions/0.1.1/index.html)
- [0.1.2](<%- path %>versions/0.1.2/index.html)
- [development/unstable (master)](<%- path %>versions/master/index.html)

# Release Notes

### 0.1.0
- Initial release.

### 0.1.1
- Fix a packaging bug that made `cldownload` inaccessible in some global installs.

### 0.1.2
- Fix [#1](https://github.com/zbentley/classeur-downloader/issues/1#): incompatibility with older NodeJS versions. Make node >=5.0 dependency explicit.
- Add release notes.
- Misc documentation updates for readability. Fixed some broken links.