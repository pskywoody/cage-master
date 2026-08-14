# -*- coding: utf-8 -*-
"""
test_engine_regression.py —— Step 2 Batch Judge Regression（回归稳定性层）
========================================================================
在 Step 1 冻结的 engine_cases.json 基础上建立「可持续回归护栏」，防止后续
改动 matcher / cascade / rules 时导致既有行为漂移。

两部分：
  A) Baseline Drift —— 重放 engine_cases.json（23 个冻结 case），把完整输出
     （matched_rules / primary / secondary / tags / ui_trigger）与 golden 快照
     engine_regression_snapshot.json 逐字段比对。首次运行自动生成快照（--gen）。
  B) Regression Cases —— 重放 engine_regression.json（阈值边界 / 级联优先级 /
     S·C·D 组合冲突），断言精确命中 + 防误触。

运行（本目录 backend-engine/）：
    ..\\run_engine_regression.ps1          # 一键跑（自动桥接 D:\\bestbay 引擎路径）
    或手动：
    $env:RULE_COV_SRC='D:\\bestbay\\backend\\src'
    $env:REGRESSION_BASELINE='<本目录>\\engine_cases.json'
    $env:REGRESSION_CASES='<本目录>\\engine_regression.json'
    $env:REGRESSION_SNAPSHOT='<本目录>\\engine_regression_snapshot.json'
    & $py 'test_engine_regression.py' [--gen]

路径：默认相对解析（放入 backend/tests/ 亦可用），亦可用环境变量覆盖。
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("RULE_COV_SRC", os.path.join(HERE, "..", "..", "bestbay", "backend", "src"))
BASELINE = os.environ.get("REGRESSION_BASELINE", os.path.join(HERE, "engine_cases.json"))
REGRESSION_CASES = os.environ.get("REGRESSION_CASES", os.path.join(HERE, "engine_regression.json"))
SNAPSHOT = os.environ.get("REGRESSION_SNAPSHOT", os.path.join(HERE, "engine_regression_snapshot.json"))

# 决定是否强制重建快照（默认：快照缺失才生成）
GEN = "--gen" in sys.argv or os.environ.get("REGRESSION_GEN") == "1"

sys.path.insert(0, SRC)

from fastapi.testclient import TestClient  # noqa: E402
import main as engine_main  # noqa: E402

client = TestClient(engine_main.app)

# 参与漂移比对的字段（完整输出，本引擎无可变项，故全量比对）
DRIFT_FIELDS = ["matched_rules", "primary_diagnosis", "secondary_diagnosis", "tags", "ui_trigger"]


def _load(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _capture(fact):
    """调用 judge 并抽取用于漂移比对的稳定输出。"""
    r = client.post("/api/v1/engine/judge", json=fact)
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    body = r.json()
    out = body["merged_output"]
    return {
        "matched_rules": body["matched_rules"],
        "primary_diagnosis": out["primary_diagnosis"],
        "secondary_diagnosis": out["secondary_diagnosis"],
        "tags": out["tags"],
        "ui_trigger": out["ui_trigger"],
    }


def _check_regression(case):
    """单个回归 case 断言：精确命中 + 防误触 + 可选 ui/tags/diag。"""
    now = _capture(case["fact"])
    exp = case["expect"]
    matched = now["matched_rules"]
    ui = now["ui_trigger"]

    if sorted(matched) != sorted(exp["matched_rules"]):
        return False, f"命中规则 = {matched}，期望 = {exp['matched_rules']}"
    for rid in exp.get("must_not", []):
        if rid in matched:
            return False, f"不应命中 {rid}，实际 {matched}"
    for key in ("show_popup", "force_quiz", "add_to_weekend_pack"):
        if key in exp and ui.get(key) != exp[key]:
            return False, f"{key} = {ui.get(key)}，期望 {exp[key]}"
    for t in exp.get("tags", []):
        if t not in now["tags"]:
            return False, f"期望标签 {t}，实际 {now['tags']}"
    if "primary_contains" in exp:
        if exp["primary_contains"] not in now["primary_diagnosis"]:
            return False, f"主诊断应含 '{exp['primary_contains']}'，实际 '{now['primary_diagnosis']}'"
    return True, "ok"


def _write_snapshot():
    """重建 golden 快照（当前行为即基线）。"""
    snap = {}
    for c in _load(BASELINE):
        snap[c["case"]] = _capture(c["fact"])
    os.makedirs(os.path.dirname(SNAPSHOT) or ".", exist_ok=True)
    with open(SNAPSHOT, "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, indent=2)
    return snap


def test_health_guard():
    """引擎可达性守卫：不硬编码规则总数（rules_v1 的增删不在本护栏职责范围，
    由运行中的引擎自行载荷）。本护栏只校验引擎可用且确实加载了规则。"""
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["rules_loaded"] > 0, "引擎未加载任何规则"


def test_baseline_no_drift():
    """A) 重放冻结 baseline，与 golden 快照全字段比对，任何漂移即失败。"""
    if GEN or not os.path.exists(SNAPSHOT):
        snap = _write_snapshot()
        print(f"[GEN] 快照已生成：{SNAPSHOT}（{len(snap)} 个 case）")
        return
    snap = _load(SNAPSHOT)
    diffs = []
    for c in _load(BASELINE):
        old = snap.get(c["case"])
        if old is None:
            diffs.append((c["case"], "快照缺失该 case", None, None))
            continue
        now = _capture(c["fact"])
        for f in DRIFT_FIELDS:
            if old[f] != now[f]:
                diffs.append((c["case"], f, old[f], now[f]))
    assert not diffs, f"{len(diffs)} 处漂移：{diffs}"
    print(f"[OK] Baseline Drift :: {len(_load(BASELINE))}/{len(_load(BASELINE))} 无漂移")


def test_regression_cases():
    """B) 边界阈值 + 级联优先级 + 组合冲突断言。"""
    cases = _load(REGRESSION_CASES)
    passed, failures = 0, []
    for c in cases:
        ok, msg = _check_regression(c)
        if ok:
            passed += 1
        else:
            failures.append((c.get("case"), c.get("rule"), msg))
    assert not failures, f"{len(failures)} 个回归 case 失败：{failures}"
    assert passed == len(cases), f"通过 {passed}/{len(cases)}"
    print(f"[OK] Regression :: {passed}/{len(cases)} case 通过（含阈值边界/级联/冲突）")


if __name__ == "__main__":
    test_health_guard()
    test_baseline_no_drift()
    test_regression_cases()
    print(f"[OK] {os.path.basename(__file__)} 全部通过")