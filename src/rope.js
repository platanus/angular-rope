angular.module('platanus.rope', [])
/**
 * Promise chaining service.
 */
.factory('rope', ['$q', function ($q) {

	var chains = null, // The current promise chain
		context = null; // The current context

	function confer(_value) {
		// if(typeof _value === 'undefined') return _value;
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

	function unseed(_value) {
		return _value && typeof _value.$$seed !== 'undefined' ? _value.$$seed : _value;
	}

	function tick(_ctx, _fun, _value) {
		var oldChains, oldContext, rval, chainLen, i;
		if(typeof _fun === 'function') {
			try {
				oldChains = chains;
				oldContext = context;
				chains = [];
				context = _ctx;

				rval = _fun.call(context, _value);
			} finally {

				// process child chains (if any).
				chainLen = chains.length;
				if(chainLen == 1) {
					// if only one, just chain it
					rval = chains[0].promise;
				} else if(chainLen > 1) {
					// join all child chains
					rval = [];
					for(i = 0; i < chainLen; i++) {
						rval.push(chains[i].promise);
					}
					rval = $q.all(rval);
				}

				chains = oldChains;
				context = oldContext;
			}
			return rval;
		} else {
			return _fun;
		}
	}

	function Chain(_promise) {
		this.promise = _promise;
		if(chains) chains.push(this);
	}

	Chain.prototype = {

		$$skip: function() {
			return (this.$$cstack && this.$$cstack.length > 0 && !this.$$cstack[this.$$cstack.length-1]);
		},

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
		 *     	   .next(this.willRegisterBook());
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
					var oldValue = self.$value;
					self.$value = unseed(_value);
					try {
						return _fun.apply(self, args);
					} finally {
						self.$value = oldValue;
					}
				};
			};
		},

		// sets a initial value for the synchronized context.
		seed: function(_value, _ctx) {
			return this.next({ $$seed: _value }, _ctx);
		},

		// execute something (function or promise) in the synchronized context.
		// TODO: args support (via angular.bind?)
		next: function(_fun, _ctx) {

			var self = this, ctx = _ctx || context;

			if(this.promise) {
				this.promise = this.promise.then(function(_val) {
					if(!self.$$skip()) {
						return tick(ctx, _fun, unseed(_val));
					}
				});
				return this;
			} else {
				return new Chain(confer(tick(ctx, _fun)));
			}
		},

		// execute on error
		handle: function(_fun, _ctx) {

			var self = this, ctx = _ctx || context;

			this.promise = this.promise.then(null, function(_reason) {
				// TODO: improve behavior, recovery, handle certain errors only, etc.
				if(!self.$$skip()) {
					var rval = confer(tick(ctx, _fun, _reason));
					if(rval) {
						return rval.then(function() {
							return reject(_reason);
						});
					} else {
						return reject(_reason);
					}
				}
			});
			return this;
		},

		// execute on error or success
		always: function(_fun, _ctx) {

			var self = this, ctx = _ctx || context;

			this.promise = this.promise['finally'](function() {
				if(!self.$$skip()) {
					return confer(tick(ctx, _fun));
				}
			});
			return this;
		},

		/** Flow control **/

		when: function(_fun, _ctx) {
			var self = this;
			this.promise
				.then(function(_value) {
					if(!self.$$cstack) {
						self.$$cstack = [];
					}
					if(typeof _fun !== 'undefined') {
						return confer(tick(_ctx, _fun, unseed(_value))).then(function(_bool) {
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
		},

		orWhen: function(_fun, _ctx) {
			var self = this;
			return this.promise
				.then(function(_value) {
					var lastVal = self.$$cstack[self.$$cstack.length-1];
					if(lastVal === false) {
						return confer(tick(_ctx, _fun, unseed(_value))).then(function(_bool) {
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
		},

		or: function() {
			return this.orWhen(true);
		},

		end: function() {
			var self = this;
			this.promise['finally'](function() {
				self.$$cstack.pop();
			});
		}
	};

	// The root chain acts as the service api.
	var rootChain = new Chain();
	return rootChain;
}]);
