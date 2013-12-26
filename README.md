Platanus Angular Chaining Framework [![Build Status](https://secure.travis-ci.org/platanus/angular-rope.png)](https://travis-ci.org/platanus/angular-rope)
===============

Tide your asynchronic code up with angular-rope!

Build user actions around **tasks** and **chains** instead of a mess of nested promises.

So something like this:

```javascript

var service = {
  somethingAsync: function(_data) {
    var prom = api.create(_data);
    if(_data.special) {
      prom = prom.then(somethingElse);
    }
    return prom
  }
}

function consumer() {
  dialogs.confirm.then(function(_ok) {
    if(_ok) {
      service.somethingAsync(data).then(function(_obj) {
        return dialogs.userInput();
      }).then(function() {
        return service.doSomethingElse();
      });
    }
  })
}

```

Looks like this:

```javascript
var service = {
  willSomethingAsync: rope.task(function(_data) {
    rope.next(api.create(_data))
        .nexfIf(_data.special)
          .next(somethingElse);
  }
};

function consumer() {
  rope.next(dialogs.confirm)
      .nextIf()
        .next(service.willSomethingAsync)
        .next(dialogs.userInput)
        .next(service.doSomethingElse, service);
}


```


## Installation:

**Optional** Use bower to retrieve package

```
bower install angular-rope --save
```

Include angular module

```javascript
angular.module('platanus.rope')
```

## Usage

The general idea is to define tasks and then chain them to produce different action sequences.

`next` is used to chain tasks, promises, functions and values. To start a new chain call `rope.next`.

```javascript
rope.next('hello') // values
    .next(someservice.willDoSomething) // tasks
    .next($timeout(something)) // promises
    .next(function(_value) { // functions
      return _value + 1;
    });
```

Steps in a chain are executed sequentially.

Try to use **tasks** whenever posible, tasks are properly isolated and will prevent unwanted code to be run before is needed.

You define *tasks* by using *task factories*, tasks factories are created using the `rope.task` method with a task handler. Tasks factories will generate tasks bound to calling context and arguments. Tasks can be passed to every chain operation, the task handler will only be called when the task is executed and it will be given the attributes and context used to invoke the factory.

If access to the previous task/promise value is required, then the handler must return a function that will inmediatelly be called with the value as unique argument and in the same context as the handler.

Its recommended to use a common prefix (like 'will') for tasks to differentiated them from methods.

```javascript
var service = {
  otherMethod: function() {
    return true;
  },
  willAppend: rope.task(function(_someArg) {
    return function(_last) { // if a function is returned, it is called inmediatelly with last value.
      if(this.otherMethod()) { // reference to this is maintained
        return _last + ' ' + _someArg;
      }
    }
  })
};

rope.seed('hello')
    .next(service.willAppend('world'))
    .next(function(_val) { console.log(_val); }) // will output 'hello world'
```

If an error occurs inside one of the tasks, then following tasks are skipped until error is handled.

```javascript
rope.next(something) // this is executed
    .next(function() { throw 'my bad'; })
    .next(somethingElse) // this is not executed
    .next(iaraiara); // this is not executed either
```

`handle` is used to catch errors that occur in tasks higher in the chain, `handle` can also handle nested chains. Handle follows the same rules than a $q promise rejection handler.

```javascript
rope.next(something) // this is executed
    .next(function() { throw 'my bad'; })
    .next(iaraiara) // this is not executed
    .handle(function(error) {
      console.log(error); // logs 'my bad'
      rope.next(childTask); // this is executed
    })
    .next(lastTask); // this is also executed
```

`always` tasks executed even if a error has ocurred and hast been handled. Always follows the same rules than a $q promise finally handler.

```javascript
rope.next(function() { throw 'my bad'; })
    .always(willAlwaysRun); // this is executed

rope.next(function() { console.log('somthing harmless'); })
    .always(willAlwaysRun); // this is also executed
```

If a chain is created inside a task or function of another chain, then the parent chain will wait the child chain to finish before moving forward.

```javascript
rope.next(aTasks) // this is executed before child tasks
    .next(function(_value) {
      rope.next(someChildTask);
    })
    .next(someParentTask); // this is executed after someChildTask
```

If an error occurs inside a child chain and is not handled, then it will bubble.

```javascript
rope.next(aTasks) // this is executed before child tasks
    .next(function(_value) {
      rope.next(function() { throw 'ball' });
      rope.next(someChildTask2); // This is executed because is another chain
    })
    .handle(function(error) { console.log(error); }); // this will output 'ball'
```

If more than one child chain is created inside a task, then parent will wait for all chains to complete before moving forward (this uses `$q.all`).

```javascript
rope.next(aTasks) // this is executed before child tasks
    .next(function(_value) {
      // first child chain
      rope.next(child1)
          .next(child2);

      // second child chain
      rope.next(child3);
    })
    .next(someParentTask); // this is executed after child2 and child3.
```

`seed` can be used if you need to force a value to be considered a value (maybe it has a then method but is not a promise)

```javascript
rope.seed('hello')
    .next(function(value) { console.log(value); }); // this will output 'hello'
```

### Flow control methods

_rope_ also provides some flow control chainable methods:

`nextIf`, `orNextIf` and `orNext` can be used to replace conditional control flow structures without leaving the chain or using nested functions.

```javascript
var retries = 3;

rope.next(confirmDialog)
    .nextIf()
      // the following will execute if confirmDialog task resolves to true.
      .next(willConfirmAction)
    .orNextIf(function() { retries == 0; })
      // the following will execute if confirmDialog returns false and retries == 0.
      .next(function() { retries--; })
      .next(willRestart)
    .orNext()
      // the following will execute in case none of the previous conditions hold.
      .next(willRollback)
    .end()
    .always(willCleanUp) // this will executed always
```

`nextCase`, `orNextCase` and `orNext` can be used to replace switches without leaving the chain or using nested functions.

```javascript
rope.next(selectDialog)
    .nextCase('launch') // If selectDialog resolves to 'launch'
      .next(willLaunch)
    .orNextCase('abort') // If selectDialog resolves to 'abort'
      .next(willAbort)
    .orNext() // In any other case
      .next(invalidAction)
    .end()
    .always(willCleanUp) // this will executed always
```

### Other utility methods.

`wait` can be used to introduce a delay in the chain

```javascript
rope.next(doSomething)
    .wait(2000) // wait 2 seconds before executing next task.
    .next(doSomethingDelayed);
```

`call` and `apply` can be used to execute a method on the last returned value given the method's name. They differ in that `apply` will take an array of arguments an pass it as the method arguments and `call` will pass each individual argument directly to the method (like javascript's call and apply).

```javascript
rope.seed({ method: function(_log) { console.log(_log); } })
    .call('method', 'im a teapot')
    .apply('method', [ 'im a flying toaster' ]);
```

TODO: forkEach
