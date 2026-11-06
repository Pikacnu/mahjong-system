# Content-layer rule. Mirrors ../ts/src/rule.js.
def evaluate(x):
    h = x["hand"]
    tanyao = True
    for k in range(34):
        if h[k] > 0 and (k >= 27 or k % 9 == 0 or k % 9 == 8):
            tanyao = False
            break
    yakuhai = 0
    for k in [31, 32, 33, x["seatWind"], x["roundWind"]]:
        if h[k] >= 3:
            yakuhai += 1
    furiten = False
    for w in x["waits"]:
        if w in x["discards"]:
            furiten = True
            break
    can_ron = x["ronDecomps"] > 0 and not furiten and (tanyao or yakuhai > 0)
    return {"furiten": furiten, "tanyao": tanyao, "yakuhai": yakuhai, "canRon": can_ron}
