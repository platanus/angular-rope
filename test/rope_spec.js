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

	var rope, tasks, $q, $rootScope;
	beforeEach(inject(['rope', 'TaskService', '$q', '$rootScope', function(_rope, _tasks, _$q, _$rootScope) {
		rope = _rope;
		tasks = _tasks;
		$q = _$q;
		$rootScope = _$rootScope;
	}]));

	describe('next', function() {

		it('should execute nested calls in proper order', function() {
			var calls = [];
			rope.next(function() { calls.push(1); })
				.next(function() { calls.push(2); })
				.next(function() {
					rope.next(function() { calls.push(3); })
						.next(function() { calls.push(4); });
				})
				.next(function() { calls.push(5); })
				.next(function() {
					rope.next(function() { calls.push(6); });
				});

			expect(calls).toEqual([1,2,3,4,5,6]);
		});

		it('should pass returned values to next function', function() {
			var value;
			rope.next(function() { return 'hello'; })
				.next(function(_value) { value = _value; });

			expect(value).toEqual('hello');
		});

		it('should accept promises', function() {
			var calls = [], promise = $q.when('world');

			rope.next(function() { calls.push('hello'); })
				.next(promise)
				.next(function(_value) { calls.push(_value); });

			$rootScope.$apply();
			expect(calls).toEqual(['hello', 'world']);
		});

		it('should accept basic types', function() {
			var calls = [];

			rope.next(function() { calls.push('hello'); })
				.next('world')
				.next(function(_value) { calls.push(_value); });

			expect(calls).toEqual(['hello', 'world']);
		});

		it('should inherit context to childs', function() {
			var ctx = { word1: 'hello', word2: 'world', word3: 'bye' },
				calls = [];

			rope.next(function() {
				calls.push(this.word1);
				rope.next(function() {
					calls.push(this.word2);
					rope.next(function() {
						calls.push(this.word3);
					});
				});
			}, ctx);
		});

		it('should wait for every child to join', function() {

		});
	});
});

