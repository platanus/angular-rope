/**
 * Angular Promise Chaining Service
 * @version v0.3.0 - 2013-12-31
 * @link https://github.com/platanus/angular-rope
 * @author Ignacio Baixas <ignacio@platan.us>
 * @license MIT License, http://www.opensource.org/licenses/MIT
 */

(function(angular, undefined) {
'use strict';
var DONE = {};

angular.module('platanus.rope', [])
/**
 * Promise chaining service.
 */
.factory('rope', ['$q', '$timeout', function ($q, $timeout) {

	var status = null; // The current status

	function confer(_value) {
		if(_value && typeof _value.then === 'function') return _value;
		// if(_value && _value.$promise) return _value.$promise; // Temp restmod support, until restmod implements 'then'

		// return $q.when(_value); this will make the library behave more asynchronous in relation to UI.

		return {
			then: function(_cb) {
				if(!_cb) return this;
				try {
					return confer(_cb(_value));
				} catch(e) {
					return reject(e);
				}
			},
			'finally': function(_cb) {
				try {
					var r = _cb();
					return typeof r === 'undefined' ? this : r;
				} catch(e) {
					return reject(e);
				}
			}
		};
	}

	function reject(_reason) {

		// return $q.reject(_reason); this will make the library behave more asynchronous in relation to UI.

		return {
			then: function(_, _cb) {
				if(!_cb) return this;
				try {
					return confer(_cb(_reason));
				} catch(e) {
					return reject(e);
				}
			},
			'finally': function(_cb) {
				try {
					_cb();
					return this; // cannot handle error in finally
				} catch(e) {
					return reject(e);
				}
			}
		};
	}

	// callback execution logic for chain actions
	function tick(_chain, _ctx, _fun, _data, _error) {
		var rval = _fun, oldStatus, chainLen, i;

		while(typeof rval === 'function') {
			try {
				oldStatus = status;
				status = {
					parent: _chain, // the parent chain
					chains: [],		// the child chains
					context: _ctx,	// propagate default context
					data: _data,	// store data in case inheritance is used
					error: _error	// store status flag in case inheritance is used
				};

				rval = rval.call(_ctx, _data);
			} finally {

				// process child chains (if any).
				chainLen = status.chains.length;
				if(chainLen === 1) {
					// if only one, just chain it
					rval = status.chains[0].promise;
				} else if(chainLen > 1) {
					// join all child chains
					rval = [];
					for(i = 0; i < chainLen; i++) {
						rval.push(status.chains[i].promise);
					}
					rval = $q.all(rval);
				}

				status = oldStatus;
			}
		}

		// on non error ticks, use last value if function does not return anything
		return typeof rval === 'undefined' && !_error ? _data : rval;
	}

	// return true if current chain step should be skipped
	function skip(_chain) {
		return _chain.$$exit || (_chain.$$ctxBlk && _chain.$$ctxBlk.length > 0 && !_chain.$$ctxBlk[_chain.$$ctxBlk.length-1]);
	}

	function context(_override) {
		return _override || (status ? status.context : null);
	}

	function Seed(_value) {
		this.value = _value;
	}

	function unseed(_value) {
		return _value && _value instanceof Seed ? _value.value : _value;
	}

	// The chain class, holds the state of the current task chain, also acts as the root chain.
	function Chain(_promise) {
		this.promise = _promise;
		if(status) status.chains.push(this);
	}

	Chain.prototype = {

		/**
		 * Loads the parent promise status into this chain.
		 *
		 * Should only be called in nested chains (like tasks)
		 *
		 * @return {Chain} self
		 */
		loadParentStatus: function() {
			var cstatus = status;
			return this.next(function() {
				return cstatus.error ? reject(cstatus.data) : confer(cstatus.data);
			});
		},

		/**
		 * Loads the parent stack into this chain.
		 *
		 * Should only be called in nested chains (like tasks)
		 *
		 * @return {Chain} self
		 */
		loadParentStack: function() {
			var self = this, cstatus = status;
			return this.next(function(_value) {
				self.stack = cstatus.parent.stack; // should this be a shallow copy?
				return _value;
			});
		},

		/**
		 * Loads both the parent's promise status and its stack into the child chain.
		 *
		 * @return {Chain} self
		 */
		loadParent: function() {
			return this.loadParentStack().loadParentStatus();
		},

		/**
		 * Sets a initial value for the synchronized context.
		 *
		 * @param  {[type]} _value [description]
		 * @param  {[type]} _ctx   [description]
		 * @return {Chain} self
		 */
		seed: function(_value, _ctx) {
			return this.next(new Seed(_value), _ctx);
		},

		/**
		 * Adds a task to the execution queue.
		 *
		 * @param  {function} _fun task, handler, value or promise
		 * @param  {object} _ctx optional call context
		 * @return {Chain} self
		 */
		next: function(_fun, _ctx) {

			var self = this, ctx = context(_ctx);

			this.promise = this.promise.then(function(_val) {
				if(!skip(self)) {
					return tick(self, ctx, _fun, unseed(_val), false);
				} else {
					return _val; // propagate
				}
			});

			return this;
		},

		/**
		 * Adds a tasks to handle error that ocurr in previous steps.
		 *
		 * @param  {function} _fun task, handler, value or promise
		 * @param  {object} _ctx optional call context
		 * @return {Chain} self
		 */
		handle: function(_fun, _ctx) {

			var self = this, ctx = context(_ctx);

			this.promise = this.promise.then(null, function(_error) {
				// TODO: improve behavior, recovery, handle certain errors only, etc.
				if(!skip(self)) {
					return tick(self, ctx, _fun, _error, true);
				} else {
					return reject(_error); // propagate
				}
			});

			return this;
		},

		/**
		 * Adds a tasks to be executed even if previous tasks fail.
		 *
		 * @param  {function} _fun task, handler, value or promise
		 * @param  {object} _ctx optional call context
		 * @return {Chain} self
		 */
		always: function(_fun, _ctx) {

			this.next(function() {
				// value is not passed through
				return typeof _fun === 'function' ? _fun.apply(this) : _fun;
			}, _ctx).handle(function(_error) {
				// rejection cannot be handled
				return confer(typeof _fun === 'function' ? _fun.apply(this) : _fun).then(function() {
					return reject(_error);
				}, function() {
					return reject(_error);
				});
			}, _ctx);

			return this;
		},

		/** Flow control **/

		/**
		 * Executes following tasks only if given function returns true or a truthy promise.
		 *
		 * If no function is given, then the last task value is considered.
		 *
		 * If false, tasks are skipped until an orNext/orNextIf/end calls is found.
		 *
		 * ```javascript
		 * rope.nextIf(true)
		 *         .next(task2) // will execute
		 *     .orNext(false)
		 *         .next(task3) //wont execute
		 *     .end()
		 *     .next(task2) // will execute
		 * ```
		 *
		 * Its also posible to nest if calls.
		 *
		 * ```javascript
		 * rope.next(task1) // will execute
		 *     .nextIf(true)
		 *         .next(task2) // will execute
		 *         .nextIf(false)
		 *             .next(task3) //wont execute
		 *         .end()
		 *         .next(task2) // will executed
		 *     .end()
		 * ```
		 *
		 * @param  {function|boolean|promise} _fun Optional boolean or boolean promise
		 * @param  {object} _ctx if _fun is a function, this is the optional context on which the function is evaluated.
		 * @return {Chain} self
		 */
		nextIf: function(_fun, _ctx) {
			var self = this;
			this.promise = this.promise.then(function(_value) {
				if(skip(self)) {
					// if parent block is skipped, skip this block too.
					self.$$ctxBlk.push(false);
				} else {
					// initialize stack if this is the first time
					if(!self.$$ctxBlk) self.$$ctxBlk = [];

					if(typeof _fun !== 'undefined') {
						// resolve condition using external value if given.
						return confer(tick(self, _ctx, _fun, unseed(_value), false)).then(function(_bool) {
							self.$$ctxBlk.push(_bool === DONE ? null : !!_bool); // use special null value when if block is 'done'
							return _value;
						});
					} else {
						// if not just use previous value.
						self.$$ctxBlk.push(!!_value);
					}
				}

				return _value;
			}).then(null, function(_err) {
				// on external or _fun error, skip entire block
				self.$$ctxBlk.push(false);
				return reject(_err);
			});

			return this;
		},

		/**
		 * Behaves similar to `nextIf`, but only evaluates to true if previous calls to `nextIf` or `orNextIf` evaluated to false.
		 *
		 * @param  {function|boolean|promise} _fun Optional boolean or boolean promise.
		 * @param  {object} _ctx if _fun is a function, this is the optional context on which the function is evaluated.
		 * @return {Chain} self
		 */
		orNextIf: function(_fun, _ctx) {
			var self = this, lastVal;
			this.promise = this.promise['finally'](function() {
				// TODO: check that stack is not empty
				lastVal = self.$$ctxBlk.pop(); // always pop but keep value
			});

			return this.nextIf(function() {
				// only consider block if last value was false
				return lastVal === false ? _fun : DONE;
			}, _ctx);
		},

		/**
		 * The negated version of `nextIf`
		 */
		nextUnless: function(_fun, _ctx) {
			var self = this;
			return this.nextIf(function(_value) {
				return confer(tick(self, this, _fun, _value, false)).then(function(_bool) {
					return !_bool;
				});
			}, _ctx);
		},

		/**
		 * The negated version of `orNextIf`
		 */
		orNextUnless: function(_fun, _ctx) {
			var self = this;
			return this.orNextIf(function(_value) {
				return confer(tick(self, this, _fun, _value, false)).then(function(_bool) {
					return !_bool;
				});
			}, _ctx);
		},

		/**
		 * Shorcut for `orNextIf(true)`
		 */
		orNext: function() {
			return this.orNextIf(true);
		},

		/**
		 * Executes following tasks only if last task value equals given value.
		 *
		 * @param {mixed} _value Value to compare last value with
		 * @return {Chain} self
		 */
		nextCase: function(_value) {
			return this.nextIf(function(_other) {
				return _value == _other;
			});
		},

		/**
		 * Like `nextCase`, but only evaluates to true if previous calls to `nextCase` or `orNextCase` evaluated to false.
		 *
		 * @param {mixed} _value Value to compare last value with
		 * @return {Chain} self
		 */
		orNextCase: function(_value) {
			return this.orNextIf(function(_other) {
				return _value == _other;
			});
		},

		/**
		 * Closes any flow control operation.
		 *
		 * @return {Chain} self
		 */
		end: function() {
			var self = this;
			this.promise = this.promise['finally'](function() {
				self.$$ctxBlk.pop();
			});
			return this;
		},

		/**
		 * Breaks current chain, no more tasks are executed.
		 *
		 * Exits does not bubble from an child chain.
		 *
		 * @return {Chain} self
		 */
		exit: function() {
			var self = this;
			return this.next(function() {
				self.$$exit = true;
			});
		},

		/**
		 * Halts chain execution for _time milliseconds.
		 *
		 * @param  {float} _time Time to sleep (in ms)
		 * @return {Chain} self
		 */
		wait: function(_time/*, _for */) {
			this.promise = this.promise.then(function(_value) {
				var defer = $q.defer();
				$timeout(function() {
					defer.resolve(_value);
				}, _time);
				return defer.promise;
			});

			return this;
		},

		/**
		 * Executes a function named `_fun` on the last returned value.
		 *
		 * @param  {string} _fun Function to execute
		 * @param  {Array} _args Arguments to pass
		 * @return {Chain} self
		 */
		apply: function(_fun, _args) {
			return this.next(function(_value) {
				return _value[_fun].apply(_value, _args);
			});
		},

		/**
		 * Similar to `apply`, but passes the function arguments directly instead of using an array.
		 *
		 * @param  {string} _fun Function to execute
		 * @return {Chain} self
		 */
		call: function(_fun /*, args */) {
			var args = Array.prototype.slice.call(arguments, 1);
			return this.apply(_fun, args);
		},

		/**
		 * TODO.
		 *
		 * @param  {[type]} _fun [description]
		 * @param  {[type]} _ctx [description]
		 * @return {[type]}      [description]
		 */
		forkEach: function(_fun, _ctx) {
			return this.next(function(_value) {
				angular.forEach(_value, function(_value) {
					(new Chain(confer(_value))).next(_fun, _ctx);
				});
			});
		},

		/**
		 * Loads a context property as the current chain value
		 *
		 * @param  {string} _name Property name
		 * @return {Chain} self
		 */
		get: function(_name) {
			return this.next(function() {
				return this[_name];
			});
		},

		/**
		 * Sets a context property value to the current chain value.
		 *
		 * @param {string} _name Property name
		 * @return {Chain} self
		 */
		set: function(_name) {
			return this.next(function(_value) {
				this[_name] = _value;
				return _value;
			});
		},

		push: function() {
			var self = this, args = arguments;
			return this.next(function(_value) {
				if(!self.stack) self.stack = [];
				if(args.length > 0) {
					// TODO: inputed values should be resolved (could be promises or functions)
					Array.prototype.push.apply(self.stack, args);
				} else {
					self.stack.push(_value);
				}
				return _value;
			});
		},

		pop: function(_name) {
			var self = this;
			return this.next(function(_value) {
				if(!self.stack) self.stack = [];
				if(_name) {
					this[_name] = self.stack.pop();
					return _value;
				} else {
					return self.stack.pop();
				}
			});
		}

		// TODO: push / pop?
	};

	// The root chain acts as the service api, it is extended with some additional methods.
	var rootNode = {
		confer: confer,
		reject: reject,

		/**
		 * Generates a new chainable task
		 *
		 * A task is just a function that can t
		 *
		 * It is recommended that tasks are prefixed with *will*, as in:
		 *
		 * ```javascript
		 * var myService = {
		 *   willCreateBook: rope.task(function(_data) {
		 *     rope.next(Book.$create(_data));
		 *         .next(this.willRegisterBook());
		 *   }),
		 *   willRegisterBook: rope.task(function(_data) {
		 *     rope.next(this.$last.update({ registration: 'today' }));
		 *   })
		 * };
		 * ```
		 *
		 * @param  {[type]} _fun [description]
		 * @return {[type]}      [description]
		 */
		task: function(_fun) {
			return function() {
				var args = arguments, self = this;
				return function(_value) {
					// isolate task context inside a new chain.
					rootNode.seed(_value).next(function() {
						return _fun.apply(this, args);
					}, self);
				};
			};
		}
	};

	// forward some chain methods to root node.
	angular.forEach(['loadParentStatus', 'loadParentStack', 'loadParent', 'seed', 'next', 'nextIf', 'nextUnless', 'get', 'set', 'push'], function(_name) {
		var fun = Chain.prototype[_name];
		rootNode[_name] = function() {
			return fun.apply(new Chain(confer(null)), arguments);
		};
	});

	return rootNode;
}]);
})(angular);