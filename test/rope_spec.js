'use strict';

describe('', function() {

	beforeEach(module('platanus.rope'));

	beforeEach(module(function($provide) {
		$provide.factory('TaskService', function(rope, $timeout) {
			return {
				willDelay: rope.task(function(_value) {
					var defered = $q.defer();
					$timeout(function() {
						defered.resolve(_value);
					}, 500);
					return defered.promise;
				})
			};
		});
	}));

	var rope, tasks, $q, $rootScope, calls, willCall, $timeout;
	beforeEach(inject(['$injector', function($injector) {
		rope = $injector.get('rope');
		tasks = $injector.get('TaskService');
		$q = $injector.get('$q');
		$rootScope = $injector.get('$rootScope');
		$timeout = $injector.get('$timeout');

		calls = [];
		willCall = rope.task(function(_log) {
			calls.push(_log);
			return _log;
		});
	}]));

	describe('task', function() {

		it('should generate a function that can only be called using a rope method', function() {
			var handler = jasmine.createSpy(),
				task = rope.task(handler);

			expect(task('hello')).toThrow();
		});

		it('should preserve context', function() {
			var ctx, service = { task: rope.task(function() {
				rope.next(function() {
					ctx = this;
				});
			}) };

			rope.next(service.task());
			expect(ctx).toBe(service);
		});

		it('should execute returned functions using the same context', function() {
			var ctx,
				service = { task: rope.task(function() {
					return function() { ctx = this; };
				}) };

			rope.next(service.task());
			expect(ctx).toBe(service);
		});

		it('should have access to last value by returning a function', function() {
			var last, service = { task: rope.task(function() {
				return function(_value) {
					last = _value;
				};
			}) };

			rope.seed('hello').next(service.task());
			expect(last).toEqual('hello');
		});

		it('should have access to parent status', function() {
			var spy = jasmine.createSpy('task'),
				service = { task: rope.task(function() {
					rope.loadParentStatus().handle(spy);
				}) };

			rope.next(function() { throw 'whatever'; })
				.always(service.task());

			expect(spy).toHaveBeenCalledWith('whatever');
		});
	});

	describe('loadParentStatus', function() {

		it('should inherit parent context status if no errors', function() {
			var spyS = jasmine.createSpy('success'), spyE = jasmine.createSpy('error');

			rope.seed('something')
				.next(function() {
					rope.loadParentStatus()
						.next(spyS)
						.handle(spyE);
				});

			expect(spyS).toHaveBeenCalledWith('something');
			expect(spyE).not.toHaveBeenCalled();
		});

		it('should inherit parent context status if no error', function() {
			var spyS = jasmine.createSpy('success'), spyE = jasmine.createSpy('error');

			rope.next(function() { return rope.reject('an error'); })
				.always(function() {
					rope.loadParentStatus()
						.next(spyS)
						.handle(spyE);
				});

			expect(spyS).not.toHaveBeenCalled();
			expect(spyE).toHaveBeenCalledWith('an error');
		});
	});

	describe('next', function() {

		it('should execute nested calls in proper order', function() {

			rope.next(willCall(1))
				.next(willCall(2))
				.next(function() {
					rope.next(willCall(3))
						.next(willCall(4));
				})
				.next(willCall(5))
				.next(function() {
					rope.next(willCall(6));
				});

			expect(calls).toEqual([1,2,3,4,5,6]);
		});

		it('should skip calls if previous call raises an error', function() {

			rope.next(willCall(1))
				.next(willCall(2))
				.next(function() {
					rope.next(willCall(3))
						.next(willCall(4))
						.next(function() { throw 'error'; });
				})
				.next(willCall(5))
				.next(function() {
					rope.next(willCall(6));
				});

			expect(calls).toEqual([1,2,3,4]);
		});

		it('should pass returned values to next function', function() {
			var value;
			rope.next(function() { return 'hello'; })
				.next(function(_value) { value = _value; });

			expect(value).toEqual('hello');
		});

		it('should accept promises', function() {
			var promise = $q.when('world');
			rope.next(willCall('hello'))
				.next(promise)
				.next(function(_value) { calls.push(_value); });

			$rootScope.$apply();
			expect(calls).toEqual(['hello', 'world']);
		});

		it('should accept basic types', function() {

			rope.next(willCall('hello'))
				.next('world')
				.next(function(_value) { calls.push(_value); });

			expect(calls).toEqual(['hello', 'world']);
		});

		it('should inherit context to childs', function() {
			var ctx = { word1: 'hello', word2: 'world', word3: 'bye' };

			rope.next(function() {
				calls.push(this.word1);
				rope.next(function() {
					calls.push(this.word2);
					rope.next(function() {
						calls.push(this.word3);
					});
				});
			}, ctx);

			expect(calls).toEqual(['hello', 'world', 'bye']);
		});

		it('should execute a function returned by a callback passing the current value, until no more functions are returned', function() {
			var spy = jasmine.createSpy('nested');
			rope.seed('hello world')
				.next(function() {
					return function() {
						return spy;
					};
				});

			expect(spy).toHaveBeenCalledWith('hello world');
		});

		it('should keep last value if a task returns nothing', function() {
			var spy = jasmine.createSpy('keeper');

			rope.seed('hao')
				.next(function() {  })
				.next(function() {  })
				.next(spy);

			expect(spy).toHaveBeenCalledWith('hao');
		});

		it('should wait for every child to join', function() {

		});
	});

	describe('seed', function() {

		it('should provide the next call to next with the given value, even if it is a promise', function() {
			var value = $q.when('wharever'), other;

			rope.seed(value)
				.next(function(_other) {
					other = _other;
				});

			expect(value).toEqual(other);
		});
	});

	describe('handle', function() {
		it('should be called on any exception that happens inside a previous call to next', function() {
			var err = 'im an error', other;

			rope.next(function() { throw err; })
				.handle(function(_err) { other = _err; });

			expect(err).toEqual(other);
		});

		it('should be called only once if handler returns nothing', function() {
			var err = 'im an error', otherA, otherB = 'not called';

			rope.next(function() { throw err; })
				.handle(function(_err) { otherA = _err; })
				.handle(function() { otherB = 'called'; });

			expect(err).toEqual(otherA);
			expect(otherB).toEqual('not called');
		});

		it('should bubble from inner chains', function() {
			var err = 'im an error', other;

			rope.next(function() {
				rope.next(function() { throw err; });
			}).handle(function(_err) { other = _err; });

			expect(err).toEqual(other);
		});

		it('should propagate error if rethrown', function() {
			var err = 'im an error', other;

			rope.next(function() { throw err; })
				.handle(function(_err) { throw _err; })
				.handle(function(_err) { other = _err; });

			expect(other).toEqual(err);
		});
	});

	describe('always', function() {

		it('should be called on success or error', function() {
			var spyS = jasmine.createSpy('success'), spyE = jasmine.createSpy('error');

			rope.seed('wharever')
				.always(spyS)
				.next(function() { rope.reject(); })
				.always(spyE);

			expect(spyS).toHaveBeenCalled();
			expect(spyE).toHaveBeenCalled();
		});

		it('shouldnt handle a rejection', function() {

			var spyE1 = jasmine.createSpy('error A'),
				spyE2 = jasmine.createSpy('error B');

			rope.next(function() { return rope.reject('teapot'); })
				.always(function() { return 'handle this!'; })
				.handle(spyE1)
				.next(function() { return rope.reject('teapot'); })
				.always(function() { return rope.reject('toaster'); })
				.handle(spyE2);

			expect(spyE1).toHaveBeenCalledWith('teapot');
			expect(spyE2).toHaveBeenCalledWith('teapot');
		});

		it('should accept a promise', function() {
			var spy = jasmine.createSpy('next');

			rope.seed('toaster')
				.always(rope.confer('teapot'))
				.next(spy);

			expect(spy).toHaveBeenCalledWith('teapot');
		});
	});

	describe('wait', function() {

		it('should halt chain execution', function() {
			var spyE1 = jasmine.createSpy('checkpoint A'),
				spyE2 = jasmine.createSpy('checkpoint B');

			rope.next(spyE1)
				.wait(400)
				.next(spyE2);

			expect(spyE1).toHaveBeenCalled();
			expect(spyE2).not.toHaveBeenCalled();
			$timeout.flush();
			expect(spyE2).toHaveBeenCalled();
		});
	});

	describe('call', function() {

		it('should execute a given last value method', function() {
			var spy = jasmine.createSpy('call'),
				test = { spy: spy };

			rope.next(test).call('spy', 'bongiorno');

			expect(spy).toHaveBeenCalledWith('bongiorno');
		});
	});

	describe('apply', function() {

		it('should execute a given last value method', function() {
			var spy = jasmine.createSpy('apply'),
				test = { spy: spy };

			rope.next(test).apply('spy', ['bongiorno']);

			expect(spy).toHaveBeenCalledWith('bongiorno');
		});
	});

	describe('flow control:', function() {

		describe('nextIf', function() {

			it('should allow to be called first', function() {
				rope.nextIf(true)
					.next(willCall(1));

				expect(calls).toEqual([1]);
			});

			it('should skip following next calls if false is given', function() {
				rope.next(willCall(1))
					.nextIf(false)
						.next(willCall(2))
						.next(willCall(3))
					.end()
					.next(willCall(4));

				expect(calls).toEqual([1,4]);
			});

			it('should use last promise value if no value is given', function() {

				rope.next(function() { return false; })
					.nextIf()
						.next(willCall(1))
					.end()

					.next(function() { return true; })
					.nextIf()
						.next(willCall(2))
					.end();

				expect(calls).toEqual([2]);
			});

			it('should allow nesting', function() {
				rope.next(willCall(1))
					.nextIf(true).next(willCall(2))
						.nextIf(false)
							.next(willCall(3))
						.end()
						.next(willCall(4))
					.orNextIf(true)
						.nextIf(true)
							.next(willCall(5))
						.end()
					.end();

				expect(calls).toEqual([1,2,4]);
			});
		});

		describe('orNextIf', function() {

			it('should behave like else', function() {
				rope.next(willCall(1))
					.nextIf(false)
						.next(willCall(2))
					.orNext()
						.next(willCall(3))
					.end()
					.next(willCall(4));

				expect(calls).toEqual([1,3,4]);
			});

			it('should behave like multiple else if', function() {
				rope.next(willCall(1))
					.nextIf(false).next(willCall(2))
					.orNextIf(false).next(willCall(3))
					.orNextIf(true).next(willCall(4))
					.orNext().next(willCall(5))
					.end()
					.next(function() { calls.push(6); });

				expect(calls).toEqual([1,4,6]);
			});
		});

		describe('nextUnless', function() {

			it('should enter if condition is false', function() {
				rope.next(willCall(1))
					.nextUnless(function(_value) { return _value != 1; })
						.next(willCall(2))
					.end();

				expect(calls).toEqual([1,2]);
			});
		});

		describe('orNextUnless', function() {

			it('should enter if condition is false', function() {
				rope.next(willCall(1))
					.nextIf(false)
						.next(willCall(2))
					.orNextUnless(function(_value) { return _value != 1; })
						.next(willCall(3))
					.end();

				expect(calls).toEqual([1,3]);
			});
		});

		describe('nextCase and orNextCase', function() {

			it('should skip if last value is different than given value', function() {
				rope.next(willCall(1))
					.nextCase(2).next(willCall(2))
					.orNextCase(1).next(willCall(3))
					.end()
					.next(willCall(4));

				expect(calls).toEqual([1,3,4]);
			});
		});

		describe('exit', function() {

			it('should break a chain', function() {
				rope.next(willCall(1))
					.nextIf(true)
						.exit()
						.next(willCall(2))
						.nextIf(true)
							.next(willCall(3))
						.end()
						.next(willCall(4))
					.orNextIf(true)
						.nextIf(true)
							.next(willCall(5))
						.end()
					.end();

				expect(calls).toEqual([1]);
			});
		});
	});

	describe('context manipulation:', function() {

		describe('get', function() {
			it('should load a context property in chain', function() {
				var ctx = { test: 'hi there' }, spy = jasmine.createSpy('get spy');

				rope.next(function() {
					rope.get('test').next(spy);
				}, ctx);

				expect(spy).toHaveBeenCalledWith('hi there');
			});
		});

		describe('set', function() {
			it('should set a context property in chain', function() {
				var ctx = { test: 'hi there' };

				rope.next(function() {
					rope.seed('bye').set('test');
				}, ctx);

				expect(ctx.test).toEqual('bye');
			});
		});
	});

	describe('chain stack methods', function() {

		describe('push', function() {
			it('should put the passed values on top of the stack', function() {
				var stack = rope.push('hello','world').stack;
				expect(stack.pop()).toEqual('world');
				expect(stack.pop()).toEqual('hello');
			});

			it('should put the chain value on top of the stack if no values are passed', function() {
				var stack = rope.seed('ontop').push().stack;
				expect(stack.pop()).toEqual('ontop');
			});
		});

		describe('pop', function() {
			it('should load the top value of the stack as the chain value', function() {
				var spy = jasmine.createSpy('pop'),
					stack = rope.push('hello').pop().next(spy).stack;

				expect(stack.length).toEqual(0);
				expect(spy).toHaveBeenCalledWith('hello');
			});

			it('should put the chain value in a context property if a name is given', function() {
				var ctx = {},
					stack = rope.push('hello')
								.next(function() {
									rope.loadParentStack().pop('test');
								}, ctx).stack;

				expect(stack.length).toEqual(0);
				expect(ctx.test).toEqual('hello');
			});
		});
	});
});
