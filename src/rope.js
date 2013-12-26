angular.module('platanus.rope', [])
/**
 * Promise chaining service.
 */
.factory('rope', ['$q', function ($q) {

	var status = null; // The current status

	function confer(_value) {
		if(_value && typeof _value.then === 'function') return _value;
		if(_value && _value.$promise) return _value.$promise; // Temp restmod support, until restmod implements 'then'

		// return $q.when(_value); this will make the library behave more asynchronous in relation to UI.

		return {
			then: function(_cb) {
				if(!_cb) return this;
				try {
					var newValue = _cb(_value);
					return typeof newValue !== 'undefined' ? confer(newValue) : this;
				} catch(e) {
					return reject(e);
				}
			},
			'finally': function(_cb) {
				try {
					var newValue = _cb();
					return typeof newValue !== 'undefined' ? confer(newValue) : this;
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
					var newValue = _cb(_reason);
					return typeof newValue !== 'undefined' ? confer(newValue) : this;
				} catch(e) {
					return reject(e);
				}
			},
			'finally': function(_cb) {
				try {
					var newValue = _cb();
					return typeof newValue !== 'undefined' ? reject(newValue) : this;
				} catch(e) {
					return reject(e);
				}
			}
		};
	}

	function tick(_ctx, _fun, _data, _error) {
		var rval = _fun, oldStatus, chainLen, i;

		while(typeof rval === 'function') {
			try {
				oldStatus = status;
				status = {
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

		return rval;
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

		$$skip: function() {
			return (this.$$cstack && this.$$cstack.length > 0 && !this.$$cstack[this.$$cstack.length-1]);
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
				if(!self.$$skip()) {
					return tick(ctx, _fun, unseed(_val), false);
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
				if(!self.$$skip()) {
					return confer(tick(ctx, _fun, _error, true));
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
		 *         .next(task2) // will execute
		 *     .end()
		 * ```
		 *
		 * @param  {function|boolean|promise} _fun Optional boolean or boolean promise
		 * @param  {object} _ctx if _fun is a function, this is the optional context on which the function is evaluated.
		 * @return {Chain} self
		 */
		nextIf: function(_fun, _ctx) {
			var self = this;
			this.promise = this.promise
				.then(function(_value) {
					if(!self.$$cstack) {
						self.$$cstack = [];
					}
					if(typeof _fun !== 'undefined') {
						return confer(tick(_ctx, _fun, unseed(_value), true)).then(function(_bool) {
							self.$$cstack.push(!!_bool);
							return _value;
						});
					} else {
						self.$$cstack.push(_value);
					}
				})
				.then(null, function(_err) {
					self.$$cstack.push(false);
					return reject(_err);
				});

			return this;
		},

		/**
		 * Behaves similar to `nextIf`, but only evaluates to true if previous calls to `nextIf` or `orNextIf` evaluated to false.
		 *
		 * @param  {function|boolean|promise} _fun Optional boolean or boolean promise
		 * @param  {object} _ctx if _fun is a function, this is the optional context on which the function is evaluated.
		 * @return {Chain} self
		 */
		orNextIf: function(_fun, _ctx) {
			var self = this;
			this.promise = this.promise
				.then(function(_value) {
					var lastVal = self.$$cstack[self.$$cstack.length-1];
					if(lastVal === false) {
						return confer(tick(_ctx, _fun, unseed(_value), true)).then(function(_bool) {
							self.$$cstack.pop();
							self.$$cstack.push(!!_bool);
							return _value;
						});
					} else if(lastVal) {
						self.$$cstack.pop();
						self.$$cstack.push(null); // use null to flag so no other or/orWhen call enters
					}
				})
				.then(null, function(_err) {
					self.$$cstack.pop();
					self.$$cstack.push(false);
					return reject(_err);
				});

			return this;
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
		 * @param  {mixed} _value Value to copare last value with
		 * @return {Chain} self
		 */
		nextCase: function(_value) {
			return this.nextIf(function(_other) {
				return _value === _other;
			});
		},

		/**
		 * Like `nextCase`, but only evaluates to true if previous calls to `nextCase` or `orNextCase` evaluated to false.
		 *
		 * @param  {mixed} _value Value to copare last value with
		 * @return {Chain} self
		 */
		orNextCase: function(_value) {
			return this.orNextIf(function(_other) {
				return _value === _other;
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
				self.$$cstack.pop();
			});
			return this;
		},

		/**
		 * TODO.
		 *
		 * @param  {[type]} _fun [description]
		 * @param  {[type]} _ctx [description]
		 * @return {[type]}      [description]
		 */
		forkEach: function(_fun, _ctx) {
			this.next(function(_value) {
				angular.forEach(_value, function(_value) {
					(new Chain(confer(_value))).next(_fun, _ctx);
				});
			});
		}

		// wait: function(_seconds/*, _for */) {
		// 	this.promise.then(function(_value) {
		// 		var defer = $q.defer();
		// 		$timeout(function() {
		// 			defer.resolve(_value);
		// 		}, _seconds);
		// 		return defer.promise;
		// 	});
		// }
	};

	// The root chain acts as the service api, it is extended with some additional methods.
	return {
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
					var r = _fun.apply(self, args);
					return typeof r === 'function' ? r.call(self, unseed(_value)) : r;
				};
			};
		},

		/**
		 * Allows a child chain to inherit the status status (error or not)
		 *
		 * This is usefull for tasks than need to access the current status to perform
		 * certain different actions.
		 *
		 * @return {Chain} new chain
		 */
		inherit: function() {
			return new Chain(
				status.error ? reject(status.data) : confer(status.data)
			);
		},

		seed: function(_value) {
			return new Chain(confer(new Seed(_value)));
		},

		next: function(_fun, _ctx) {
			return (new Chain(confer(null))).next(_fun, _ctx);
		},

		nextIf: function(_fun, _ctx) {
			return (new Chain(confer(null))).nextIf(_fun, _ctx);
		}
	};
}]);
