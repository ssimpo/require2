/*jshint node: true */

/**
 * @external bluebird
 * @see {@link https://github.com/petkaantonov/bluebird}
 */

'use strict';

var Promise = require('bluebird');  // jshint ignore:line
var fs = require('fs');
var path = require('path');
var _eval = require('eval');
var _ = require('lodash');
var resolver = new (require('async-resolve'))();
var callsite = require('callsite');

var readFile = Promise.promisify(fs.readFile);


/**
 * Resolve a module path starting from current directory via returned promise.
 *
 * @public
 * @param {Object} [userResolver=resolver]      User-created resolver function.
 * @param {string} moduleName                   Module name or path (same
 *                                              format as supplied
 *                                              to require()).
 * @returns {bluebird}
 */
function resolveModulePath(userResolver, moduleName) {
  moduleName = moduleName || userResolver;
  userResolver = userResolver || resolver;

  var dir = getRoot(userResolver);
  return new Promise(function(resolve, reject) {
    getResolve(userResolver).resolve(
        moduleName,
        dir,

        function(err, modulePath) {
          if (err) {
            return reject(err);
          }

          return resolve(modulePath);
        }
    );
  });
}

/**
 * Calculate the calling directory path by examing the stack-trace.
 *
 * @private
 * @returns {string}      Directory path
 */
function getCallingDir() {
  var dir;

  callsite().every(function(trace) {
    var traceFile = trace.getFileName();
    if(traceFile !== __filename){
      dir = path.dirname(traceFile);
      return false;
    }

    return true;
  });

  return dir;
}

/**
 * Get the root directory to use from the supplied object or calculate it.
 *
 * @private
 * @param {Object} obj    The options object containing a 'dir' property.
 * @returns {string}      The directory path.
 */
function getRoot(obj) {
  return obj.dir || getCallingDir();
}

/**
 * Get the resolver object from a given object.  Assumes it has received
 * either an actual resolver or an options object with resolver in it.  If this
 * is not true then return the default resolver.
 *
 * @private
 * @param {Object} obj    Object to get resolver from.
 * @returns {Object}      The resolver object.
 */
function getResolve(obj) {
  if(obj){
    return (obj.resolver || obj.resolve?obj:resolver);
  }
  return resolver;
}

/**
 * Return given value as array.  If already an array, just return as-is.
 * Undefined will return an empty array.
 *
 * @private
 * @param {Array|*} ary     Value to return as an array
 * @returns {Array}
 */
function makeArray(ary) {
  return (
      (ary === undefined)?
          []:
          (_.isArray(ary)?ary:[ary])
  );
}

/**
 * Load a module or return a default value.  Can take an array to try.  Will
 * load module asychronously.
 *
 * @public
 * @param {string|Array} modulePath             Module path or array of paths.
 * @param {*} [defaultReturnValue=false]        The default value to return
 *                                              if module load fails.
 * @returns {bluebird}
 */
function getModule(modulePath, defaultReturnValue) {
  if (modulePath) {
    modulePath = makeArray(modulePath);
    return requireAsync(modulePath.shift()).catch(function(error) {
      if(modulePath.length){
        return requireAsync(modulePath);
      }

      return Promise.resolve(defaultReturnValue || false);
    });
  }

  return Promise.resolve(defaultReturnValue || false);
}

/**
 * Read text from a file and handle any errors.
 *
 * @private
 * @param {string} fileName
 * @returns {bluebird}
 */
function loadModuleText(fileName) {
  return readFile(fileName, 'utf8');
}

/**
 * Evaluate module text in similar fashion to require evaluations.
 *
 * @private
 * @param {string} modulePath   The path of the evaluated module.
 * @param {string} moduleText   The text content of the module.
 * @returns {*}
 */
function evalModuleText(modulePath, moduleText) {
  return (
      (moduleText !== undefined)?
          _eval(moduleText, modulePath, {}, true):
          undefined
  );
}

/**
 * Load and evaluate a module returning undefined to promise resolve
 * on failure.
 *
 * @private
 * @param {string} modulePath   The path of the evaluated module.
 * @returns {*}
 */
function loadModule(modulePath) {
  return loadModuleText(modulePath).then(function(moduleText) {
    return evalModuleText(modulePath, moduleText);
  });
}

/**
 * Load a module
 *
 * @private
 * @param {Object} [userResolver=resolver]      User-created resolver function.
 * @param {string} moduleName                   Module name or path, same
 *                                              format as for require().
 * @returns {bluebird}
 */
function loader(userResolver, moduleName) {
  moduleName = moduleName || userResolver;
  userResolver = userResolver || resolver;

  return resolveModulePath(userResolver, moduleName).then(function(modulePath) {
    return loadModule(modulePath);
  }, function(error) {
    return Promise.reject(error);
  });
}

/**
 * Load a module asychronously, this is an async version of require().  Will
 * load a collection of modules if an array is supplied.  Will reject if module
 * is not found or on error.
 *
 * @public
 * @param {Object} [userResolver=resolver]      User-created resolver function
 *                                              or an options object.
 * @param {string|Array} moduleName             Module name or path (or
 *                                              array of either), same format
 *                                              as for require().
 * @param {function} [callback]                 Node-style callback to use
 *                                              instead of (or as well as)
 *                                              returned promise.
 * @returns {bluebird}                          Promise, resolved with the
 *                                              module(s) or undefined.
 */
function requireAsync(userResolver, moduleName, callback) {
  if(_.isString(userResolver) || _.isArray(userResolver)){
    callback = moduleName;
    moduleName = userResolver;
    userResolver = resolver;
  }

  var async;
  if (_.isArray(moduleName)){
    async = Promise.all(moduleName.map(function(moduleName) {
      loader(userResolver, moduleName);
    }));
  } else {
    async = loader(userResolver, moduleName);
  }

  if (callback) {
    async.nodeify(callback);
  }

  return async;
}

/**
 * Generate a new resolver object following specfic rules defined in the
 * options parametre. If no options are supplied, return a default resolver.
 *
 * @public
 * @param {Object} options    Options to pass to the resolver object
 * @returns {Object}          The new resolver object or the current module
 *                            resolver if no options supplied.
 */
function getResolver(options) {
  return new (require('async-resolve'))(options || {});
}

requireAsync.resolve = resolveModulePath;
requireAsync.getModule = getModule;
requireAsync.getResolver = getResolver;

/**
 * NodeJs module loading with an asynchronous flavour
 *
 * @module require-extra
 * @version 0.2.0
 * @type {function}
 */
module.exports = requireAsync;
