angular.module('demo', [
  'platanus.rope'
])
.controller('DemoCtrl', function($scope) {
  $scope.error1 = null;
  $scope.error2 = null;
  $scope.input = { foo: 'Valor inicial', bar: 'bar' };
})
.directive('showError', function() {
  return {
    restrict: 'A',
    require: 'ngModel',
    link: function(_scope, _element, _attrs, _ctrl) {
      _scope.$watch(function() {
        if(_ctrl === undefined || _ctrl.$valid) {
          return null;
        } else {
          var msg = null;
          angular.forEach(_ctrl.$error, function(k, v) {
            if(k && !msg) msg = v; // just show the first message.
          });
          return msg;
        }
      }, function(_msg) {
        _scope[_attrs.showError] = _msg;
      });
    }
  };
})
.factory('AsyncValidator', function($timeout, $q) {
  return function() {
    var d = $q.defer();
    $timeout(function() {
      d.resolve(true);
    }, 3000);
    return d.promise;
  };
});
