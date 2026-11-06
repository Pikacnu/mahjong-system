// Content-layer rule used by every variant. It runs natively, inside QuickJS,
// inside a Worker and behind gRPC from this exact source text.
// The Starlark version in ../../go/rule.star and the Go version in rule.go mirror it.
function evaluate(x) {
  var h = x.hand;
  var tanyao = true;
  for (var k = 0; k < 34; k++) {
    if (h[k] > 0 && (k >= 27 || k % 9 === 0 || k % 9 === 8)) {
      tanyao = false;
      break;
    }
  }
  var yakuhai = 0;
  var yk = [31, 32, 33, x.seatWind, x.roundWind];
  for (var i = 0; i < yk.length; i++) {
    if (h[yk[i]] >= 3) yakuhai++;
  }
  var furiten = false;
  for (var w = 0; w < x.waits.length && !furiten; w++) {
    for (var d = 0; d < x.discards.length; d++) {
      if (x.waits[w] === x.discards[d]) {
        furiten = true;
        break;
      }
    }
  }
  var canRon = x.ronDecomps > 0 && !furiten && (tanyao || yakuhai > 0);
  return { furiten: furiten, tanyao: tanyao, yakuhai: yakuhai, canRon: canRon };
}
