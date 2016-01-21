'use strict';

function versionIndexTemplate(path) {
    return {
        options: {
            data: {
                path: path
            }
        },
        files: {
            'doc/generated/tutorials/VersionIndex.md': ['doc/generator/VersionIndex.md.tpl'],
        }
    };
}

function branchDocumentationTasks(target) {
    const version = '<%= pkg.version %>',
        name = '<%= pkg.name %>';
    target = target || version;
    const path = `doc/generated/versions/${target}`;
    return {
        jsdoc: {
            src: ['*.js', 'lib/'],
            options: {
                configure: 'doc/generator/jsdoc.json',
                recurse: true,
                encoding: 'utf8',
                destination: path,
                package: 'package.json',
                template : 'node_modules/ink-docstrap/template',
                readme: 'README.md',
                tutorials: 'doc/generated/tutorials/'
            }
        },
        copy: {
            cwd: `${path}/${name}/${version}`,
            expand: true,
            src: '**',
            dest: path,
        },
        clean: [`${path}/${name}/`],
        push: {
            options: {
                base: 'doc/generated',
                add: true,
                message: `Generated on <%= grunt.template.today('yyyy-mm-dd HH:MM') %> (doc: ${target}; pkg: ${version})`,
            },
            src: ['**']
        }
    };
}

module.exports = function(grunt) {
    const packageInfo = grunt.file.readJSON('package.json'),
        docTasksCurrent = branchDocumentationTasks(),
        docTasksMaster = branchDocumentationTasks('master');

    grunt.loadNpmTasks('grunt-jsdoc');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-gh-pages');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-template');

    grunt.initConfig({
        pkg: packageInfo,
        template: {
            'index-root': versionIndexTemplate('./'),
            'index-version': versionIndexTemplate('../../')
        },
        clean: {
          'doc-all': ['doc/generated'],
          'doc-tutorials': ['doc/generated/tutorials'],
          'doc-master':  docTasksMaster.clean,
          'doc-current-version': docTasksCurrent.clean
        },
        copy: {
            'doc-master': docTasksMaster.copy,
            'doc-current-version': docTasksCurrent.copy,
            'doc-index': {
                cwd: 'doc/tutorials',
                expand: true,
                src: ['*.md', 'tutorials.json'],
                dest: 'doc/generated/tutorials/',
            }
        },
        jsdoc: {
            master: docTasksMaster.jsdoc,
            'current-version': docTasksCurrent.jsdoc,
            index: {
                src: ['doc/generator/index-placeholder.jsdoc'],
                options: {
                    configure: 'doc/generator/jsdoc.json',
                    recurse: false,
                    encoding: 'utf8',
                    destination: 'doc/generated',
                    template : 'node_modules/ink-docstrap/template',
                    readme: 'doc/generated/tutorials/VersionIndex.md',
                    tutorials: 'doc/generated/tutorials/'
                }
            }
        },
        'gh-pages': {
            master: docTasksMaster.push,
            'current-version': docTasksCurrent.push
        }
    });

    grunt.registerTask('doc:index', [
        // Remove all generated files.
        'clean:doc-all',
        // Render the version index template for the root (no relative links).
        // This has the beneficial side effect of creating the doc target
        // directory, `doc/generated` and `doc/generated/tutorials`.
        'template:index-root',
        // Copy the tutorials and their config file into `doc/generated/tutorials`.
        'copy:doc-index',
        // Generate documentation for an empty project (`index-placeholder.jsdoc`)
        // using the version index template as the README. This makes a decent
        // landing page without having to manually write any markup or menus.
        // Laziness trumps elegance.
        'jsdoc:index',
        // Re-render the version index template (it's no longer needed for the
        // landing page generation) with relative links that can be used by the
        // per-version documentation.
        'template:index-version'
    ]);
    grunt.registerTask('doc:master', [
        'doc:index',
        'jsdoc:master',
        'copy:doc-master',
        'clean:doc-master',
        'clean:doc-tutorials'
    ]);
    grunt.registerTask('doc:current-version', [
        'doc:index',
        'jsdoc:current-version',
        'copy:doc-current-version',
        'clean:doc-current-version',
        'clean:doc-tutorials'
    ]);
    grunt.registerTask('doc:master:push', [
        'doc:master',
        'gh-pages:master',
        'clean:doc-all'
    ]);
    grunt.registerTask('doc:current-version:push', [
        'doc:current-version',
        'gh-pages:current-version',
        'clean:doc-all'
    ]);
};