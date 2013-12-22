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

	var rope, tasks, $q, $rootScope, calls, willCall;
	beforeEach(inject(['rope', 'TaskService', '$q', '$rootScope', function(_rope, _tasks, _$q, _$rootScope) {
		rope = _rope;
		tasks = _tasks;
		$q = _$q;
		$rootScope = _$rootScope;

		calls = [];
		willCall = rope.task(function(_log) {
			calls.push(_log);
			return _log;
		});
	}]));

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
	});
});
