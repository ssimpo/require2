'use strict';

var Promise = require('bluebird');
var fs = require('fs');
var _eval = require('eval');
var _ = require('lodash');
var resolver = new (require('async-resolve'))();

var readFile = Promise.promisify(fs.readFile);
var self = this;


/**
 * Resolve a module path starting from current directory via returned promise.
 *
 * @public
 * @param {Object} [userResolver=resolver]      User-created resolver function.
 * @param {string} moduleName                   Module name or path (same
 *                                              format as supplied
 *                                              to require()).
 * @returns {Promise}
 * @returns {Promise}
 */
function resolveModulePath(userResolver, moduleName) {
  moduleName = moduleName || userResolver;
  userResolver = userResolver || resolver;

  return new Promise(function(resolve, reject) {
    userResolver.resolve(moduleName, __dirname, function(err, modulePath) {
      if (err) {
        return reject(err);
      }

      return resolve(modulePath);
    });
  });
}

/**
 * Return given value as array.  If already an array, just return as-is.
 * Undefined will return an empty array.
 *
 * @private
 * @param {Array|mixed} ary     Value to return as an array
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
 * @param {mixed} [defaultReturnValue=false]    The default value to return
 *                                              if module load fails.
 * @returns {Promise}
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
 * @returns {string|undefined}
 */
function loadModuleText(fileName) {
  return readFile(fileName, 'utf8').then(function(moduleText) {
    return moduleText;
  });
}

/**
 * Evaluate module text in similar fashion to require evaluations.
 *
 * @private
 * @param {string} modulePath   The path of the evaluated module.
 * @param {string} moduleText   The text content of the module.
 * @returns {mixed}
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
 * @param {string} moduleText   The text content of the module.
 * @returns {mixed}
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
 * @returns {Promise}
 */
function loader(userResolver, moduleName){
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
 * @param {Object} [userResolver=resolver]      User-created resolver function.
 * @param {string|Array} moduleName             Module name or path (or
 *                                              array of either), same format
 *                                              as for require().
 * @param {function} [callback]                 Node-style callback to use
 *                                              instead of (or as well as)
 *                                              returned promise.
 * @returns {Promise}                           Promise, resolved with the
 *                                              module(s) or undefined.
 */
function requireAsync(userResolver, moduleName, callback) {
  if(_.isString(userResolver) || _.isArray(userResolver)){
    callback = moduleName;
    moduleName = userResolver;
    userResolver = resolver;
  }

  if (_.isArray(moduleName)){
    var async = Promise.all(moduleName.map(function(moduleName){
      loader(userResolver, moduleName);
    }));
  } else {
    var async = loader(userResolver, moduleName);
  }

  if (callback) {
    async.nodeify(callback);
  }

  return async;
}

/**
 * Generate a new resolver object following specfic rules defined in the
 * options parametre. If no options are supplied, return the default resolver.
 *
 * @public
 * @param {Object} options    Options to pass to the resolver object
 * @returns {Object}          The new resolver object or the current module
 *                            resolver if no options supplied.
 */
function getResolver(options) {
  if(options){
    return new (require('async-resolve'))(options);
  }

  return resolver;
}

requireAsync.resolve = resolveModulePath;
requireAsync.getModule = getModule;
requireAsync.getResolver = getResolver;

module.exports = requireAsync;
